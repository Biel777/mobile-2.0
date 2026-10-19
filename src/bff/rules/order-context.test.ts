import { expect, it } from 'vitest';
import { fixtures } from '@data/fixtures';
import { resolveOrderTable } from './order-context';
import type { LocalOrder } from './types';

it('troca o preço e o mix da prévia ao alterar o primeiro distribuidor sem mudar o catálogo', () => {
  const source = fixtures.tables[0];
  const table = {
    ...source,
    priceContexts: [
      { customerId: 11, distributorId: 501, products: [{ ...source.products[0], listPrice: 10 }] },
      { customerId: 11, distributorId: 502, products: [{ ...source.products[0], listPrice: 99 }] },
    ],
  };
  const order = { customerId: 11, distributorIds: [501, 502] } as LocalOrder;
  expect(resolveOrderTable(table, order)?.products[0].listPrice).toBe(10);
  expect(
    resolveOrderTable(table, { ...order, distributorIds: [502, 501] })?.products[0].listPrice,
  ).toBe(99);
  expect(resolveOrderTable(table, { ...order, customerId: 12 })?.products).toEqual([]);
  expect(table.products).toBe(source.products);
});
