import type { CommercialTable, LocalOrder } from './types';

/** The first distributor in the sending order owns the offline price preview. */
export function resolveOrderTable(table: CommercialTable | undefined, order: LocalOrder) {
  if (!table?.priceContexts) return table;
  const context = table.priceContexts.find(
    (item) =>
      item.customerId === order.customerId && item.distributorId === order.distributorIds[0],
  );
  return { ...table, products: context?.products ?? [] };
}
