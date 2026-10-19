import { describe, expect, it } from 'vitest';
import { fixtures } from '@data/fixtures';
import { promoteIfDue, splitLines } from './schedule';

describe('agendamento', () => {
  it('deixa o resto do fracionamento no primeiro envio', () => {
    const [first, second] = splitLines(fixtures.tables[0], [{ ean: '78910001', quantity: 30 }], 2);
    expect(first[0].quantity).toBe(18);
    expect(second[0].quantity).toBe(12);
  });

  it('libera pedido agendado quando a data chega', () => {
    const [order] = promoteIfDue(
      [{ status: 3, dataEnvio: '2026-10-15', subOrders: [{ status: 3 }] }],
      '2026-10-16',
    );
    expect(order.status).toBe(4);
    expect(order.subOrders[0].status).toBe(4);
  });
});
