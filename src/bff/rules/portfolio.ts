import type { Customer, PdvRef } from './types';
/** The API has already scoped the customer to the representative's area. */
export function isPortfolioCustomer(customer: Pick<Customer, 'hasSalesArea' | 'areaId'>): boolean {
  return customer.hasSalesArea === true && Number.isFinite(customer.areaId) && customer.areaId > 0;
}
/** Unknown references may belong to a partial cache; only confirmed denials are excluded. */
export function filterPortfolioRefs<T extends PdvRef>(refs: T[], customers: Customer[]): T[] {
  const blocked = new Set(customers.filter(customer => !isPortfolioCustomer(customer)).map(customer => customer.id));
  return refs.filter(customer => !blocked.has(customer.id));
}
