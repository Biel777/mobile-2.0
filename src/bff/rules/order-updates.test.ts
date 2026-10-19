import { describe, expect, it } from 'vitest';
import { isAttention, isUnread, reconcileOrderUpdates } from './order-updates';
import type { LocalOrder, TrackedOrder } from './types';
const at = '2026-10-17T10:00:00.000Z';
const order = (): TrackedOrder => ({
  id: 10,
  orderClientId: 'local-10',
  customerName: 'Farmácia',
  tableName: 'Tabela',
  status: 4,
  prazo: 21,
  createdAt: at,
  subOrders: [
    {
      id: 101,
      distributorName: 'Distribuidor',
      status: 4,
      prazo: 21,
      items: [
        {
          ean: '123',
          name: 'Produto',
          unitPrice: 10,
          discountPercent: 0,
          quantPed: 10,
          quantEsp: 0,
          quantNot: 0,
        },
      ],
    },
  ],
});
const accepted = () => {
  const value = order();
  value.status = 1;
  value.subOrders[0].status = 1;
  value.subOrders[0].items[0].quantEsp = 10;
  return value;
};
const failed = (): LocalOrder => ({
  id: 'local-10',
  orderClientId: 'local-10',
  customerId: 1,
  customerName: 'Farmácia',
  tableId: 1,
  userId: 1,
  createdAt: at,
  lines: [],
  distributorIds: [],
  prazos: {},
  localStatus: 9,
  queueStatus: 'failed',
  lastError: 'Timeout',
  deliveryUncertain: true,
});

describe('central agrupada por pedido', () => {
  it('baseline saudável começa lida e aguardando retorno não gera corte falso', () => {
    const updates = reconcileOrderUpdates([], [order()], [], at, true);
    expect(updates).toHaveLength(1);
    expect(isUnread(updates[0])).toBe(false);
    expect(isAttention(updates[0])).toBe(false);
  });
  it('agrupa distribuidores e deduplica polls mesmo com arrays reordenados', () => {
    const value = accepted();
    value.subOrders.push({ ...structuredClone(value.subOrders[0]), id: 102 });
    let updates = reconcileOrderUpdates([], [value], [], at, true);
    value.subOrders[1].status = 6;
    updates = reconcileOrderUpdates(updates, [value], [], '2026-10-17T11:00:00Z');
    value.subOrders.reverse();
    updates = reconcileOrderUpdates(updates, [value], [], '2026-10-17T12:00:00Z');
    expect(updates).toHaveLength(1);
    expect(updates[0].events).toHaveLength(2);
    expect(isAttention(updates[0])).toBe(true);
    expect(isUnread(updates[0])).toBe(true);
  });
  it('ler não resolve pendência; revisão reabre em mudança e resolução limpa', () => {
    const value = accepted();
    value.subOrders[0].items[0].quantEsp = 5;
    let updates = reconcileOrderUpdates([], [value], [], at, true);
    updates[0].readFingerprint = updates[0].fingerprint;
    expect(isAttention(updates[0])).toBe(true);
    updates[0].reviewedFingerprint = updates[0].fingerprint;
    expect(isAttention(updates[0])).toBe(false);
    value.subOrders[0].items[0].quantEsp = 4;
    updates = reconcileOrderUpdates(updates, [value], [], '2026-10-17T11:00:00Z');
    expect(isAttention(updates[0])).toBe(true);
    value.subOrders[0].items[0].quantEsp = 10;
    updates = reconcileOrderUpdates(updates, [value], [], '2026-10-17T12:00:00Z');
    expect(isAttention(updates[0])).toBe(false);
    value.subOrders[0].items[0].quantEsp = 4;
    updates = reconcileOrderUpdates(updates, [value], [], '2026-10-17T13:00:00Z');
    expect(isAttention(updates[0])).toBe(true);
  });
  it('inclui falha local e reconcilia histórico para um único pedido remoto', () => {
    const local = failed();
    let updates = reconcileOrderUpdates([], [], [local], at);
    expect(isAttention(updates[0])).toBe(true);
    expect(updates[0].localOrderId).toBe(local.id);
    updates = reconcileOrderUpdates(
      updates,
      [accepted()],
      [{ ...local, remoteId: 10, queueStatus: 'sent' }],
      '2026-10-17T11:00:00Z',
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].orderId).toBe(10);
    expect(updates[0].events).toHaveLength(2);
    expect(isAttention(updates[0])).toBe(false);
  });
  it('reconcilia tenant sem order_client_id pelo ID remoto e preserva histórico', () => {
    const local = { ...failed(), remoteId: 10 };
    let updates = reconcileOrderUpdates([], [], [local], at);
    updates = reconcileOrderUpdates(
      updates,
      [{ ...accepted(), orderClientId: '' }],
      [{ ...local, queueStatus: 'sent' }],
      '2026-10-17T11:00:00Z',
    );
    expect(updates).toHaveLength(1);
    expect(updates[0].events).toHaveLength(2);
    expect(updates[0].key).toBe('remote:10');
  });
  it('nota vira atualização sem inferir faturamento apenas do status aceito', () => {
    const value = accepted();
    let updates = reconcileOrderUpdates([], [value], [], at, true);
    expect(updates[0].title).toBe('Aceito');
    value.subOrders[0].invoice = { number: 'NF-10', value: 100, issuedAt: at };
    value.subOrders[0].items[0].quantNot = 10;
    updates = reconcileOrderUpdates(updates, [value], [], '2026-10-17T11:00:00Z');
    expect(updates[0].title).toBe('Pedido faturado');
    expect(isUnread(updates[0])).toBe(true);
  });
  it('limita histórico por pedido sem descartar pendências de alto volume', () => {
    const value = accepted();
    let updates = reconcileOrderUpdates([], [value], [], at, true);
    for (let i = 0; i < 30; i++) {
      value.subOrders[0].items[0].quantEsp = i;
      updates = reconcileOrderUpdates(updates, [value], [], `${at}:${i}`);
    }
    expect(updates[0].events).toHaveLength(20);
    const values = Array.from({ length: 250 }, (_, i) => ({
      ...order(),
      id: i,
      orderClientId: `order-${i}`,
      status: 11,
    }));
    updates = reconcileOrderUpdates([], values, [], at, true);
    expect(updates.filter(isAttention)).toHaveLength(250);
    const healthy = values.map((item) => ({ ...item, status: 4 }));
    updates = reconcileOrderUpdates([], healthy, [], at, true);
    updates = reconcileOrderUpdates(updates, healthy, [], '2026-10-17T12:00:00Z');
    expect(updates).toHaveLength(250);
    expect(updates.filter(isUnread)).toHaveLength(0);
  });
});
