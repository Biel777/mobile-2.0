import type { LocalOrder, SubmitOrderPayload, SubmitOrderResult } from '@rules/types';
import type { SalesApiClient } from '@tradetools/client';

export function toPayload(order: LocalOrder, distributors: SubmitOrderPayload['array_ordem_envio']): SubmitOrderPayload {
  return {
    order_client_id: order.orderClientId,
    codigo_pedido: order.customerOrderCode?.trim() || order.id,
    id_cliente: order.customerId,
    id_tabela: order.tableId,
    id_usuario: order.userId,
    datahora_criacao: order.createdAt,
    array_ordem_envio: distributors,
    array_produtos: order.lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({ ean: line.ean, quantidade: line.quantity })),
    array_agendamento: order.scheduleDates?.map((data_envio) => ({ data_envio })),
    cupom: order.couponCode,
    justificativa: order.justificativa,
  };
}

export async function flushQueue(
  orders: LocalOrder[],
  client: SalesApiClient,
  distributorsFor: (order: LocalOrder) => SubmitOrderPayload['array_ordem_envio'],
  options: { shouldContinue?: () => boolean; onError?: (error: unknown) => void; onSending?: (order: LocalOrder) => void; preparePayload?: (order: LocalOrder, payload: SubmitOrderPayload) => SubmitOrderPayload } = {},
): Promise<LocalOrder[]> {
  const next: LocalOrder[] = [];
  for (const order of orders) {
    if (options.shouldContinue && !options.shouldContinue()) { next.push(order); continue; }
    if (order.queueStatus !== 'pending' && order.queueStatus !== 'failed') {
      next.push(order);
      continue;
    }
    let sending = { ...order, queueStatus: 'sending' as const };
    try {
      const initial = order.submissionPayload ?? toPayload(order, distributorsFor(order));
      const payload = order.submissionPayload ?? options.preparePayload?.(order, initial) ?? initial;
      sending = { ...sending, submissionPayload: payload };
      options.onSending?.(sending);
      const result: SubmitOrderResult = await client.submitOrder(payload);
      if (result.erros_envio.length > 0) {
        next.push({ ...sending, queueStatus: 'failed', deliveryUncertain: false, submissionPayload: undefined, lastError: result.erros_envio.join(' · ') });
        continue;
      }
      if (!Number.isInteger(result.id_pedido_gerado) || result.id_pedido_gerado <= 0) throw new Error('API não confirmou um ID de pedido válido. Consulte o acompanhamento antes de reenviar.');
      next.push({
        ...sending,
        deliveryUncertain: false,
        queueStatus: 'sent',
        remoteId: result.id_pedido_gerado,
        localStatus: result.id_status as LocalOrder['localStatus'],
        lastError: undefined,
      });
    } catch (error) {
      options.onError?.(error);
      const detail = error as { code?: string; remoteId?: number };
      const rejected = ['INVALID_REQUEST', 'UNSUPPORTED_FIELD', 'CONFIG', 'AUTH', 'LEGACY_REJECTED'].includes(detail?.code ?? '');
      next.push({
        ...sending,
        queueStatus: 'failed',
        deliveryUncertain: !rejected && !!sending.submissionPayload,
        submissionPayload: rejected ? undefined : sending.submissionPayload,
        remoteId: detail?.remoteId ?? sending.remoteId,
        retryAuthorized: false,
        lastError: error instanceof Error ? error.message : 'Falha de rede',
      });
    }
  }
  return next;
}
