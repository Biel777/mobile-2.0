import type { SubOrder, TrackedOrder } from './types';
import { ORDER_STATUS } from './status';

export const ORDER_PROGRESS_LABELS = [
  'Pedido criado',
  'Enviado ao distribuidor',
  'Aguardando resposta',
  'Retorno recebido',
  'Aguardando nota',
  'Pedido faturado',
] as const;

export type OrderProgress = {
  currentIndex: number;
  completed: boolean;
  steps: { label: typeof ORDER_PROGRESS_LABELS[number]; state: 'completed' | 'current' | 'upcoming' }[];
  note: string;
  severity: 'info' | 'success' | 'warning' | 'error';
  details: {
    acceptedQuantity: number;
    invoicedQuantity: number;
    invoiceCount: number;
    pendingDistributorCount: number;
    excludedDistributorCount: number;
  };
};

const beforeDispatch = [3, 7, 9, 13, 14];
const refused = [6, 11, 12];
const returned = [15, 16];
const awaiting = [2, 4];
const responseReceived = [1, 5, 6, 10, 11, 12, 15, 16];
const quantity = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
const hasInvoice = (sub: SubOrder) => Boolean(sub.invoice?.number.trim() && sub.invoice.issuedAt.trim());

/** Snapshot only: completed steps express the current stage, never fabricated event dates. */
export function getOrderProgress(order: TrackedOrder): OrderProgress {
  // Rejected distributor attempts are not additional deliveries to be invoiced.
  // Preserve a rejected attempt with actual invoicing evidence for exception handling.
  const excluded = order.subOrders.filter(s => refused.includes(s.status) && !hasInvoice(s) && s.items.every(i => quantity(i.quantNot) === 0));
  const active = order.subOrders.filter(s => !excluded.includes(s));
  const relevant = active.filter(s => s.items.some(i => quantity(i.quantEsp) > 0 || quantity(i.quantNot) > 0));
  const details: OrderProgress['details'] = {
    acceptedQuantity: active.reduce((sum, s) => sum + s.items.reduce((n, i) => n + quantity(i.quantEsp), 0), 0),
    invoicedQuantity: order.subOrders.reduce((sum, s) => sum + s.items.reduce((n, i) => n + quantity(i.quantNot), 0), 0),
    invoiceCount: order.subOrders.filter(hasInvoice).length,
    pendingDistributorCount: active.filter(s => awaiting.includes(s.status)).length,
    excludedDistributorCount: excluded.length,
  };
  function result(currentIndex: number, note: string, severity: OrderProgress['severity'] = 'info', completed = false): OrderProgress {
    return { currentIndex, completed, note, severity, details,
      steps: ORDER_PROGRESS_LABELS.map((label, i) => ({ label, state: i < currentIndex || completed ? 'completed' : i === currentIndex ? 'current' : 'upcoming' })),
    };
  }

  if (beforeDispatch.includes(order.status)) {
    const notes: Record<number, string> = {
      3: order.dataEnvio ? `Envio agendado para ${order.dataEnvio}.` : 'Envio agendado; aguardando a data programada.',
      7: 'Pedido em digitação; envio ainda não confirmado.',
      9: 'Pedido pendente; envio ao distribuidor ainda não confirmado.',
      13: 'Pedido bloqueado por margem; envio ao distribuidor ainda não confirmado.',
      14: 'Aguardando mínimo de bandeira; envio ao distribuidor ainda não confirmado.',
    };
    return result(0, notes[order.status], order.status === 3 || order.status === 7 ? 'info' : 'warning');
  }
  if (refused.includes(order.status)) return result((order.status === 11 || order.status === 12) && order.subOrders.length === 0 ? 0 : 3, `${ORDER_STATUS[order.status]}. O fluxo foi interrompido; não há confirmação de conclusão do pedido.`, order.status === 12 ? 'warning' : 'error');
  if (returned.includes(order.status) || active.some(s => returned.includes(s.status))) {
    return result(3, `${ORDER_STATUS[returned.includes(order.status) ? order.status : active.find(s => returned.includes(s.status))!.status]}. Consulte o retorno e os documentos do distribuidor.`, 'warning');
  }
  if (active.some(s => refused.includes(s.status))) return result(3, 'Há um retorno de recusa ou cancelamento com documentos de faturamento. Confirme a situação desse atendimento com o distribuidor.', 'warning');
  if (excluded.length > 0 && active.length === 0) return result(3, 'Os distribuidores retornaram recusa ou cancelamento. Não há atendimento confirmado para faturar.', 'error');
  if (!ORDER_STATUS[order.status] || active.some(s => !ORDER_STATUS[s.status])) return result(order.subOrders.length === 0 ? 0 : 3, 'Status não reconhecido. Confirme a situação com o distribuidor antes de considerar o pedido concluído.', 'warning');

  const hasResponse = responseReceived.includes(order.status) || active.some(s => responseReceived.includes(s.status));
  if (order.status === 4 || details.pendingDistributorCount > 0) {
    if (order.status === 2 && !hasResponse && active.every(s => s.status === 2)) return result(1, 'Envio em processamento; aguardando confirmação do distribuidor.');
    return result(2, details.invoiceCount > 0 ? 'Há nota em parte do pedido, mas ainda falta resposta de outro distribuidor.' : hasResponse ? 'Retorno recebido de parte dos distribuidores; aguardando as demais respostas.' : 'Pedido enviado; aguardando resposta do distribuidor.');
  }
  if (order.status === 2) return result(1, 'Envio em processamento; aguardando confirmação do distribuidor.');

  // A positive accepted quantity defines the fulfilment target. If only the billed
  // quantity is supplied, retain the requested target; do not infer partial acceptance.
  const allInvoiced = relevant.length > 0 && relevant.every(s => hasInvoice(s) && s.items.every(i => {
    const accepted = quantity(i.quantEsp);
    const invoiced = quantity(i.quantNot);
    if (accepted === 0 && invoiced === 0) return true;
    const target = accepted || quantity(i.quantPed);
    return target > 0 && invoiced >= target;
  }));
  if (allInvoiced && active.every(s => relevant.includes(s) && !beforeDispatch.includes(s.status))) {
    const partial = relevant.some(s => s.items.some(i => quantity(i.quantNot) < quantity(i.quantPed)));
    return result(5, partial ? 'Atendimento confirmado integralmente faturado. Há unidades pedidas não atendidas; confira os itens e as notas.' : 'Atendimento confirmado integralmente faturado, com nota em cada distribuidor responsável.', partial ? 'warning' : 'success', true);
  }
  if (relevant.length > 0) return result(4,
    details.invoiceCount > 0 ? 'Faturamento parcial ou notas incompletas. Aguardando o restante do atendimento confirmado.' : 'Atendimento confirmado; aguardando a nota fiscal do distribuidor.');
  return result(3, hasResponse ? 'Retorno recebido. As quantidades atendidas e o faturamento ainda não foram confirmados.' : 'Aguardando confirmação do retorno e das quantidades atendidas.', 'info');
}
