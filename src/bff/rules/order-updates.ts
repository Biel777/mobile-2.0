import { getOrderProgress } from './order-progress';
import { statusLabel } from './status';
import type { LocalOrder, TrackedOrder } from './types';

export type OrderUpdateEvent = { id: string; title: string; summary: string; at: string };
export type OrderUpdate = {
  key: string;
  orderId?: number;
  localOrderId?: string;
  customerName: string;
  title: string;
  summary: string;
  at: string;
  events: OrderUpdateEvent[];
  fingerprint: string;
  attention: boolean;
  readFingerprint?: string;
  reviewedFingerprint?: string;
};
export const isAttention = (update: OrderUpdate) =>
  update.attention && update.reviewedFingerprint !== update.fingerprint;
export const isUnread = (update: OrderUpdate) => update.readFingerprint !== update.fingerprint;

const keyFor = (order: TrackedOrder | LocalOrder) =>
  order.orderClientId ? `client:${order.orderClientId}` : `remote:${order.id}`;
const attentionStatuses = [6, 9, 10, 11, 12, 13, 14, 15, 16];
const responseStatuses = [1, 5, 10, 15, 16];
function remoteSnapshot(order: TrackedOrder) {
  const progress = getOrderProgress(order);
  const cut = order.subOrders.some(
    (sub) =>
      responseStatuses.includes(sub.status) &&
      sub.items.some((item) => item.quantEsp < item.quantPed),
  );
  const attention =
    attentionStatuses.includes(order.status) ||
    order.subOrders.some((sub) => attentionStatuses.includes(sub.status)) ||
    cut;
  const title = cut
    ? 'Atendimento parcial'
    : progress.completed
      ? 'Pedido faturado'
      : statusLabel(order.status);
  const summary = cut
    ? 'Há unidades não atendidas. Confira os itens e o retorno dos distribuidores.'
    : progress.note;
  // Sorting excludes API array order and sync timestamps from event identity.
  const fingerprint = JSON.stringify([
    order.status,
    order.dataEnvio ?? '',
    [...order.subOrders]
      .sort((a, b) => a.id - b.id)
      .map((sub) => [
        sub.id,
        sub.status,
        sub.invoice ?? null,
        [...sub.items]
          .sort((a, b) => a.ean.localeCompare(b.ean))
          .map((item) => [
            item.ean,
            item.quantPed,
            item.quantEsp,
            item.quantNot,
            item.reason ?? '',
            item.unitPrice,
            item.discountPercent,
          ]),
      ]),
  ]);
  return {
    key: keyFor(order),
    orderId: order.id,
    customerName: order.customerName,
    title,
    summary,
    attention,
    fingerprint,
  };
}
function localSnapshot(order: LocalOrder) {
  const attention = order.queueStatus === 'failed';
  const title = attention
    ? order.deliveryUncertain
      ? 'Envio sem confirmação'
      : 'Falha no envio'
    : order.queueStatus === 'sent'
      ? 'Pedido enviado'
      : order.queueStatus === 'sending'
        ? 'Enviando pedido'
        : order.queueStatus === 'pending'
          ? 'Envio pendente'
          : 'Em digitação';
  const summary = attention
    ? order.lastError || 'Confira o pedido antes de tentar novamente.'
    : order.queueStatus === 'sent'
      ? 'Envio confirmado. Aguardando atualização do distribuidor.'
      : 'Acompanhe o envio na tela do pedido.';
  return {
    key: keyFor(order),
    orderId: order.remoteId,
    localOrderId: order.id,
    customerName: order.customerName || `Cliente ${order.customerId}`,
    title,
    summary,
    attention,
    fingerprint: JSON.stringify([
      'local',
      order.queueStatus ?? 'draft',
      !!order.deliveryUncertain,
      attention ? (order.lastError ?? '') : '',
    ]),
  };
}

/** Observed snapshots, not fabricated dates of business events. Baseline good states start read. */
export function reconcileOrderUpdates(
  previous: OrderUpdate[],
  tracked: TrackedOrder[],
  locals: LocalOrder[],
  at: string,
  baseline = false,
): OrderUpdate[] {
  const next = new Map(previous.map((update) => [update.key, update]));
  const remoteKeys = new Set(tracked.map(keyFor));
  const remoteIds = new Set(tracked.map((order) => order.id));
  const snapshots = [
    ...tracked.map((order) => ({
      ...remoteSnapshot(order),
      localOrderId: locals.find(
        (local) => local.orderClientId === order.orderClientId || local.remoteId === order.id,
      )?.id,
    })),
    ...locals
      .filter(
        (order) =>
          !remoteKeys.has(keyFor(order)) &&
          !(order.remoteId && remoteIds.has(order.remoteId)) &&
          (order.queueStatus === 'failed' || next.has(keyFor(order))),
      )
      .map(localSnapshot),
  ];
  for (const snapshot of snapshots) {
    // Some tenants only return numeric remote IDs; migrate the local failure history on reconciliation.
    const alias = snapshot.localOrderId
      ? previous.find(
          (update) => update.localOrderId === snapshot.localOrderId && update.key !== snapshot.key,
        )
      : undefined;
    const old = next.get(snapshot.key) ?? alias;
    if (alias) next.delete(alias.key);
    if (old?.fingerprint === snapshot.fingerprint) {
      next.set(snapshot.key, { ...old, ...snapshot });
      continue;
    }
    const event = {
      id: `${at}:${snapshot.fingerprint}`,
      title: snapshot.title,
      summary: snapshot.summary,
      at,
    };
    next.set(snapshot.key, {
      ...old,
      ...snapshot,
      at,
      events: [event, ...(old?.events ?? [])].slice(0, 20),
      readFingerprint: baseline && !snapshot.attention ? snapshot.fingerprint : undefined,
      // Clearing an issue also removes its acknowledgment, so a later recurrence reopens it.
      reviewedFingerprint: undefined,
    });
  }
  // Keep every unresolved issue. History of inactive orders is bounded independently.
  const sorted = [...next.values()].sort(
    (a, b) => b.at.localeCompare(a.at) || a.key.localeCompare(b.key),
  );
  let archived = 0;
  const currentKeys = new Set(snapshots.map((snapshot) => snapshot.key));
  return sorted.filter(
    (update) => currentKeys.has(update.key) || isAttention(update) || archived++ < 200,
  );
}
