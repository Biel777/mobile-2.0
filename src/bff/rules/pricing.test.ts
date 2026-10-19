import { describe, expect, it } from 'vitest';
import { fixtures } from '@data/fixtures';
import { attainment, gap, quoteLine, quoteOrder } from './pricing';

const table = fixtures.tables[0];

describe('motor comercial', () => {
  it('aplica desconto-base + faixa progressiva', () => {
    const atSix = quoteLine(table, [{ ean: '78910001', quantity: 6 }], '78910001', 6);
    const atTwelve = quoteLine(table, [{ ean: '78910001', quantity: 12 }], '78910001', 12);
    expect(atSix.discountPercent).toBe(10);
    expect(atTwelve.discountPercent).toBe(15);
    expect(atTwelve.badges).toContain('faixa');
    expect(atTwelve.net).toBe(Number((18.5 * 12 * 0.85).toFixed(2)));
  });

  it('aplica extra de produto gatilho no filho', () => {
    const lines = [
      { ean: '78910001', quantity: 10 },
      { ean: '78910002', quantity: 6 },
    ];
    const child = quoteLine(table, lines, '78910002', 6);
    expect(child.discountPercent).toBe(11);
    expect(child.badges).toContain('gatilho');
  });

  it('soma cupom e respeita teto 99,99 e teto do PDV', () => {
    const coupon = fixtures.coupons[0];
    const quoted = quoteLine(table, [{ ean: '78910003', quantity: 6 }], '78910003', 6, coupon);
    expect(quoted.discountPercent).toBe(12);
    expect(quoted.badges).toContain('cupom');
    expect(quoted.badges).toContain('teto');
  });

  it('calcula totais do pedido', () => {
    const quote = quoteOrder(table, [{ ean: '78910001', quantity: 12 }]);
    expect(quote.gross).toBe(222);
    expect(quote.net).toBe(188.7);
    expect(quote.discountValue).toBe(33.3);
  });

  it('calcula atingimento e gap das metas', () => {
    expect(attainment(100000, 40000)).toBe(40);
    expect(gap(100000, 40000)).toBe(60000);
  });
});
