import { describe, expect, it } from 'vitest';
import { isAttention, isUnread, reconcileOrderUpdates } from './order-updates';
import type { LocalOrder, TrackedOrder } from './types';

const at = '2026-10-17T10:00:00Z';
function order(id = 1, status = 1): TrackedOrder {
  return {
    id,
    orderClientId: `mobile-${id}`,
    customerName: 'PDV',
    tableName: 'Tabela',
    status,
    prazo: 21,
    createdAt: at,
    subOrders: [
      {
        id: id * 10,
        distributorName: 'OPL',
        status,
        prazo: 21,
        items: [
          {
            ean: '123',
            name: 'Produto',
            unitPrice: 10,
            discountPercent: 0,
            quantPed: 10,
            quantEsp: 10,
            quantNot: 0,
          },
        ],
      },
    ],
  };
}

describe('QA independente da central de pedidos', () => {
  it('uma nova mudança reabre a atenção mesmo quando retorna ao estado revisado anteriormente', () => {
    const original = order(1, 11);
    let updates = reconcileOrderUpdates([], [original], [], at, true);
    updates[0].reviewedFingerprint = updates[0].fingerprint;
    updates[0].readFingerprint = updates[0].fingerprint;
    const changed = structuredClone(original);
    changed.subOrders[0].items[0].reason = 'Nova recusa';
    updates = reconcileOrderUpdates(updates, [changed], [], '2026-10-17T10:01:00Z');
    expect(isAttention(updates[0])).toBe(true);
    updates = reconcileOrderUpdates(updates, [original], [], '2026-10-17T10:02:00Z');
    expect(isAttention(updates[0])).toBe(true);
    expect(isUnread(updates[0])).toBe(true);
  });

  it('alto volume não cria novidades em pedidos inalterados removidos pelo limite de histórico', () => {
    const tracked = Array.from({ length: 1000 }, (_, index) => order(index + 1));
    const baseline = reconcileOrderUpdates([], tracked, [], at, true);
    expect(baseline.filter(isUnread)).toHaveLength(0);
    const polled = reconcileOrderUpdates(baseline, tracked, [], '2026-10-17T10:01:00Z');
    expect(polled.filter(isUnread)).toHaveLength(0);
  });

  it('leitura não resolve atenção e o mesmo polling não gera novo evento', () => {
    const tracked = order(1, 11);
    let updates = reconcileOrderUpdates([], [tracked], [], at, true);
    updates[0].readFingerprint = updates[0].fingerprint;
    updates = reconcileOrderUpdates(updates, [tracked], [], '2026-10-17T10:01:00Z');
    expect(updates).toHaveLength(1);
    expect(updates[0].events).toHaveLength(1);
    expect(isAttention(updates[0])).toBe(true);
    expect(isUnread(updates[0])).toBe(false);
  });

  it('reconcilia falha local com retorno remoto sem order_client_id e mantém só um pedido', () => {
    const local: LocalOrder = {
      id: 'loc-1',
      orderClientId: 'loc-1',
      customerId: 1,
      customerName: 'PDV',
      tableId: 1,
      userId: 1,
      createdAt: at,
      lines: [],
      distributorIds: [],
      prazos: {},
      localStatus: 9,
      queueStatus: 'failed',
      remoteId: 99,
      deliveryUncertain: true,
      lastError: 'Retorno perdido',
    };
    let updates = reconcileOrderUpdates([], [], [local], at);
    const remote = order(99, 1);
    remote.orderClientId = '';
    updates = reconcileOrderUpdates(
      updates,
      [remote],
      [{ ...local, queueStatus: 'sent' }],
      '2026-10-17T10:01:00Z',
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].orderId).toBe(99);
    expect(updates[0].events).toHaveLength(2);
    expect(isAttention(updates[0])).toBe(false);
  });
});
