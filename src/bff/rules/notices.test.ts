import { describe, expect, it } from 'vitest';
import { acceptanceNotice } from './notices';

describe('avisos de status', () => {
  it('descreve o aceite do distribuidor', () => {
    const notice = acceptanceNotice({
      orderId: 8804,
      distributorName: 'Profarma Campinas',
      at: '2026-10-16T20:00:00',
    });
    expect(notice.text).toBe('Profarma Campinas aceitou o pedido 8804.');
    expect(notice.orderId).toBe(8804);
  });
});
