import { expect, it } from 'vitest';
import { fixtures } from '@data/fixtures';
import { reviewOrder } from './order-review';
import type { LocalOrder } from './types';

it('valida datas reais, impede duplicatas e calcula a divisão no motor offline', () => {
  const table = { ...fixtures.tables[0], dividePedido: true };
  const product = table.products[0];
  const order = { id: 'review', customerId: fixtures.customers[0].id, tableId: table.id, lines: [{ ean: product.ean, quantity: product.packSize * 20 }], distributorIds: [], prazos: {}, scheduleDates: ['2026-10-20', '2026-10-21'] } as unknown as LocalOrder;
  const input = { table, customer: fixtures.customers[0], order, now: new Date('2026-10-19T12:00:00Z') };
  const result = reviewOrder(input);
  expect(result.scheduled.map(part => part.lines[0].quantity)).toEqual([product.packSize * 10, product.packSize * 10]);
  const invalid = reviewOrder({ ...input, order: { ...order, scheduleDates: ['2027-02-30', '2027-02-30'] } });
  expect(invalid.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['DATE_0', 'DATE_1', 'DUPLICATE_DATE']));
  expect(invalid.canSubmit).toBe(false);
});
