import { describe, expect, it } from 'vitest';
import { mockClient } from '@tradetools/mock';
import type { LocalOrder } from '@rules/types';
import { flushQueue } from './queue';

function draft(id: string): LocalOrder {
  return {
    id,
    orderClientId: `oc-${id}`,
    customerId: 11,
    tableId: 101,
    userId: 77,
    createdAt: '2026-10-16T12:00:00',
    distributorIds: [501],
    prazos: { 501: 28 },
    lines: [{ ean: '78910001', quantity: 30 }],
    localStatus: 7,
    queueStatus: 'pending',
  };
}

describe('fila de envio', () => {
  it('envia pedido pendente uma única vez mesmo com retry', async () => {
    const first = await flushQueue(
      [draft('A')],
      mockClient,
      () => [{ id_distribuidor: 501, prioridade: 1, tipo_envio: 2, prazo: 28 }],
    );
    const retry = await flushQueue(
      first.map((order) => ({ ...order, queueStatus: 'pending' as const })),
      mockClient,
      () => [{ id_distribuidor: 501, prioridade: 1, tipo_envio: 2, prazo: 28 }],
    );
    expect(first[0].queueStatus).toBe('sent');
    expect(retry[0].remoteId).toBe(first[0].remoteId);
  });

  it('mantém o rascunho quando a validação do servidor falha', async () => {
    const invalid: LocalOrder = { ...draft('B'), lines: [{ ean: '78910002', quantity: 6 }] };
    const result = await flushQueue(
      [invalid],
      mockClient,
      () => [{ id_distribuidor: 501, prioridade: 1, tipo_envio: 2, prazo: 28 }],
    );
    expect(result[0].queueStatus).toBe('failed');
    expect(result[0].lastError).toMatch(/mínimo/i);
  });
});
