import { findProduct } from './pricing';
import type { CommercialTable, OrderLine } from './types';

/** Parte as quantidades em N envios. O resto do fracionamento fica no primeiro. */
export function splitLines(table: CommercialTable, lines: OrderLine[], parts: number): OrderLine[][] {
  const count = Math.max(1, parts);
  return Array.from({ length: count }, (_, part) =>
    lines
      .map((line) => {
        const pack = findProduct(table, line.ean)?.packSize ?? 1;
        const packs = Math.floor(line.quantity / pack);
        const base = Math.floor(packs / count);
        const extra = part === 0 ? packs - base * count : 0;
        return { ean: line.ean, quantity: (base + extra) * pack };
      })
      .filter((line) => line.quantity > 0),
  );
}

export function promoteIfDue<T extends { status: number; dataEnvio?: string; subOrders: { status: number }[] }>(
  orders: T[],
  today: string,
): T[] {
  return orders.map((order) => {
    if (order.status !== 3 || !order.dataEnvio || order.dataEnvio > today) {
      return order;
    }
    return {
      ...order,
      status: 4,
      subOrders: order.subOrders.map((sub) => (sub.status === 3 ? { ...sub, status: 4 } : sub)),
    };
  });
}
