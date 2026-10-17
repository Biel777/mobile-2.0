import { filterPortfolioRefs, isPortfolioCustomer } from './portfolio';
import type { BootstrapData } from '../api/client';
import type { LocalOrder, PdvRef, TrackedOrder } from './types';
export type Visit = { customerId: number; date: string; completedAt?: string };
export type VisitCustomer = PdvRef & { cnpj?: string };
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function validVisitDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1900 || year > 9999) return false;
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
export function getVisitCustomers(catalog: BootstrapData): VisitCustomer[] {
  const unique = new Map<number, VisitCustomer>();
  for (const customer of [...catalog.customers.filter(isPortfolioCustomer), ...filterPortfolioRefs(catalog.goals.pdvsSemPositivar, catalog.customers), ...filterPortfolioRefs(catalog.goals.families.flatMap(family => family.semPositivar), catalog.customers)]) {
    if (!unique.has(customer.id)) unique.set(customer.id, customer);
  }
  return [...unique.values()];
}
const normalizeCnpj = (value?: string) => value?.replace(/\D/g, '') || undefined;
/** Names are display labels, never an identity join. */
export function getCustomerOrders(customer: VisitCustomer, tracked: TrackedOrder[], locals: LocalOrder[]): { tracked: TrackedOrder[]; local: LocalOrder[] } {
  const local = locals.filter(order => order.customerId === customer.id);
  const cnpj = normalizeCnpj(customer.cnpj);
  const remote = tracked.filter(order => {
    if (order.customerId !== undefined) return order.customerId === customer.id;
    const orderCnpj = normalizeCnpj(order.customerCnpj);
    if (orderCnpj) return !!cnpj && orderCnpj === cnpj;
    return local.some(draft => draft.remoteId === order.id || !!order.orderClientId && draft.orderClientId === order.orderClientId);
  });
  return { tracked: remote, local: local.filter(draft => !remote.some(order => draft.remoteId === order.id || !!order.orderClientId && draft.orderClientId === order.orderClientId)) };
}
