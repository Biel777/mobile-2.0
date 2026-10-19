import { resolveOrderTable } from '@rules/order-context';
import { quoteOrder } from '@rules/pricing';
import { acceptanceNotice } from '@rules/notices';
import { isAttention } from '@rules/order-updates';
import type { LocalOrder } from '@rules/types';
import { flushQueue } from '../sync/queue';

import type { AppState, StoreContext } from './store';

export function createOrdersActions(
  context: StoreContext,
): Pick<
  AppState,
  | 'createDraft'
  | 'updateDraft'
  | 'enqueue'
  | 'retryUncertain'
  | 'flush'
  | 'refreshTracked'
  | 'markOrderUpdateRead'
  | 'reviewOrderUpdate'
  | 'markAllOrderUpdatesRead'
> {
  const { get, set, canSync, fail, getClient, getGeneration, isFlushing, setFlushing, getConfig } =
    context;
  return {
    markOrderUpdateRead(key) {
      set({
        orderUpdates: get().orderUpdates.map((update) =>
          update.key === key ? { ...update, readFingerprint: update.fingerprint } : update,
        ),
      });
    },
    reviewOrderUpdate(key) {
      set({
        orderUpdates: get().orderUpdates.map((update) =>
          update.key === key
            ? {
                ...update,
                reviewedFingerprint: update.fingerprint,
                readFingerprint: update.fingerprint,
              }
            : update,
        ),
      });
    },
    markAllOrderUpdatesRead() {
      set({
        orderUpdates: get().orderUpdates.map((update) =>
          isAttention(update) ? update : { ...update, readFingerprint: update.fingerprint },
        ),
      });
    },
    createDraft(customerId, tableId, customerName) {
      // TODO(TL): confirmar o vínculo de lojas adicionais; não tratar toda a carteira como lojas adicionais.
      const { session, catalog } = get();
      if (!session || catalog.user.id !== session.userId)
        throw new Error('Entre e sincronize a carteira antes de digitar.');
      const id = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const order: LocalOrder = {
        id,
        orderClientId: id,
        customerId,
        customerName:
          customerName ?? catalog.customers.find((item) => item.id === customerId)?.name,
        tableId,
        userId: session.userId,
        createdAt: new Date().toISOString(),
        distributorIds: [],
        prazos: {},
        lines: [],
        localStatus: 7,
      };
      set({ orders: [order, ...get().orders] });
      return id;
    },
    updateDraft(id, patch) {
      set({
        orders: get().orders.map((order) =>
          order.id !== id ||
          order.queueStatus === 'sending' ||
          order.queueStatus === 'sent' ||
          order.deliveryUncertain
            ? order
            : {
                ...order,
                ...patch,
                ...(order.queueStatus === 'failed'
                  ? { queueStatus: undefined, lastError: undefined }
                  : {}),
                id: order.id,
                orderClientId: order.orderClientId,
                userId: order.userId,
              },
        ),
      });
    },
    enqueue(id) {
      set({
        orders: get().orders.map((order) =>
          order.id === id && order.queueStatus !== 'sent' && order.queueStatus !== 'sending'
            ? { ...order, queueStatus: 'pending', lastError: undefined }
            : order,
        ),
      });
      if (canSync()) void get().flush();
    },
    retryUncertain(id) {
      set({
        orders: get().orders.map((order) =>
          order.id === id && order.deliveryUncertain && !order.remoteId
            ? { ...order, retryAuthorized: true, queueStatus: 'pending' }
            : order,
        ),
      });
      if (canSync()) void get().flush();
    },
    async flush() {
      const client = getClient();
      if (!canSync() || isFlushing()) return;
      const snapshot = get().orders.filter(
        (order) =>
          order.userId === get().session?.userId &&
          (order.queueStatus === 'pending' || order.queueStatus === 'failed') &&
          (getConfig().protocol !== 'legacy' ||
            !order.deliveryUncertain ||
            (order.retryAuthorized && !order.remoteId)),
      );
      if (!snapshot.length) return;
      const epoch = getGeneration();
      setFlushing(true);
      const ids = new Set(snapshot.map((order) => order.id));
      set({
        orders: get().orders.map((order) =>
          ids.has(order.id) ? { ...order, queueStatus: 'sending' } : order,
        ),
        syncError: undefined,
      });
      try {
        const flushed = await flushQueue(
          snapshot,
          client,
          (order) => {
            const customer = get().catalog.customers.find((item) => item.id === order.customerId);
            return order.distributorIds.map((id, index) => {
              const distributor = customer?.distributors.find((item) => item.id === id);
              if (!distributor)
                throw new Error('Distribuidor não encontrado no cache. Sincronize a carteira.');
              const prazo = order.prazos[id] ?? distributor.prazos[0];
              return {
                id_distribuidor: id,
                prioridade: index + 1,
                tipo_envio: distributor.tipoEnvio,
                prazo,
                codigo_faturamento: distributor.codigoFaturamentoPorPrazo?.[prazo],
              };
            });
          },
          {
            shouldContinue: () => epoch === getGeneration() && canSync(),
            onError: (error) => {
              if (epoch === getGeneration()) fail(error);
            },
            preparePayload: (order, payload) => {
              const table = resolveOrderTable(
                get().catalog.tables.find((item) => item.id === order.tableId),
                order,
              );
              if (!table) throw new Error('Condição comercial ausente. Sincronize a carteira.');
              const coupon = get().catalog.coupons.find((item) => item.code === order.couponCode);
              const quote = quoteOrder(table, order.lines, coupon);
              return {
                ...payload,
                array_produtos: payload.array_produtos.map((item) => ({
                  ...item,
                  desconto: quote.lines.find((line) => line.ean === item.ean)?.discountPercent ?? 0,
                })),
              };
            },
            onSending: (sending) => {
              if (epoch === getGeneration())
                set({
                  orders: get().orders.map((order) =>
                    order.id === sending.id ? { ...sending, retryAuthorized: false } : order,
                  ),
                });
            },
          },
        );
        if (epoch !== getGeneration()) return;
        const byId = new Map(flushed.map((order) => [order.id, order]));
        set({
          orders: get().orders.map((order) => byId.get(order.id) ?? order),
          syncError: flushed.find((order) => order.queueStatus === 'failed')?.lastError,
        });
        await get().refreshTracked();
      } catch (error) {
        if (epoch === getGeneration()) fail(error);
      } finally {
        setFlushing(false);
        if (epoch === getGeneration())
          set({
            orders: get().orders.map((order) =>
              ids.has(order.id) && order.queueStatus === 'sending'
                ? {
                    ...order,
                    queueStatus: 'failed',
                    deliveryUncertain: true,
                    lastError: 'Envio interrompido. Atualize para tentar novamente.',
                  }
                : order,
            ),
          });
        if (
          epoch === getGeneration() &&
          get().orders.some((order) => !ids.has(order.id) && order.queueStatus === 'pending')
        )
          void get().flush();
      }
    },
    async refreshTracked() {
      const startedAt = new Date().toISOString();
      const client = getClient();
      if (!canSync()) return;
      const epoch = getGeneration();
      try {
        for (const order of get().orders.filter(
          (item) => item.deliveryUncertain && item.remoteId,
        )) {
          if (epoch !== getGeneration() || !canSync()) return;
          if (client.getOrderStatus) {
            const result = await client.getOrderStatus(order.remoteId!);
            if (epoch !== getGeneration()) return;
            if (!result.erros_envio.length && result.id_pedido_gerado > 0)
              set({
                orders: get().orders.map((item) =>
                  item.id === order.id
                    ? {
                        ...item,
                        queueStatus: 'sent',
                        deliveryUncertain: false,
                        lastError: undefined,
                      }
                    : item,
                ),
              });
          }
        }
        const tracked = await client.listOrders();
        if (epoch !== getGeneration()) return;
        const at = new Date().toISOString();
        const notices = tracked
          .filter(
            (order) =>
              order.status === 1 &&
              get().tracked.some((old) => old.id === order.id && old.status !== 1),
          )
          .map((order) =>
            acceptanceNotice({
              orderId: order.id,
              distributorName: order.subOrders[0]?.distributorName ?? 'Distribuidor',
              at,
            }),
          );
        const orders = get().orders.map((order) => {
          const remote = tracked.find((item) => item.orderClientId === order.orderClientId);
          return remote && order.queueStatus !== 'sending'
            ? {
                ...order,
                queueStatus: 'sent' as const,
                remoteId: remote.id,
                deliveryUncertain: false,
                lastError: undefined,
              }
            : order;
        });
        set({
          tracked,
          orders,
          syncError: orders.find((order) => order.queueStatus === 'failed')?.lastError,
          notices: [...notices, ...get().notices].slice(0, 50),
          lastOrderSync: startedAt,
          lastSync: at,
        });
      } catch (error) {
        if (epoch === getGeneration()) fail(error);
      }
    },
  };
}
