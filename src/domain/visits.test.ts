import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtures } from '../data/fixtures';
import { getCustomerOrders, getVisitCustomers, localDateKey, validVisitDate } from './visits';
import type { LocalOrder, TrackedOrder } from './types';
afterEach(() => vi.useRealTimers());
describe('agenda local de visitas', () => {
  it('usa dia local do dispositivo e muda corretamente à meia-noite', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 17, 23, 59, 59));
    expect(localDateKey()).toBe('2026-10-17'); vi.advanceTimersByTime(1000); expect(localDateKey()).toBe('2026-10-18');
    expect(localDateKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
    expect(localDateKey(new Date(2027, 0, 1))).toBe('2027-01-01');
  });
  it('rejeita datas normalizadas ou impossíveis', () => {
    for (const value of ['2026-02-29', '2026-13-01', '2026-04-31', '2026-1-01', 'foo', '0000-01-01']) expect(validVisitDate(value)).toBe(false);
    expect(validVisitDate('2028-02-29')).toBe(true);
  });
  it('reúne carteira e referências das metas sem duplicar lojas', () => {
    const all = getVisitCustomers(fixtures);
    expect(new Set(all.map(customer => customer.id)).size).toBe(all.length);
    for (const family of fixtures.goals.families) for (const customer of family.semPositivar) expect(all.some(candidate => candidate.id === customer.id)).toBe(true);
    expect(all.find(customer => customer.id === 11)?.cnpj).toBe(fixtures.customers[0].cnpj);
  });
  it('não vincula pedido por nomes iguais; usa ID/CNPJ ou alias local exato', () => {
    const customer = { id: 11, name: 'Mesmo nome', city: 'A', cnpj: '12.345.678/0001-90' };
    const base = { ...fixtures.tracked[0], customerName: 'Mesmo nome', customerId: undefined, customerCnpj: undefined };
    const orders: TrackedOrder[] = [
      { ...base, id: 1, orderClientId: 'unknown' },
      { ...base, id: 2, customerId: 11 },
      { ...base, id: 3, customerCnpj: '12345678000190' },
      { ...base, id: 4, orderClientId: 'local-4' },
      { ...base, id: 5, customerId: 22, customerCnpj: '12345678000190' },
    ];
    const local: LocalOrder = { id: 'local-4', orderClientId: 'local-4', customerId: 11, tableId: 101, userId: 1, createdAt: '', lines: [], distributorIds: [], prazos: {}, localStatus: 7 };
    const result = getCustomerOrders(customer, orders, [local, { ...local, id: 'draft', orderClientId: 'draft' }]);
    expect(result.tracked.map(order => order.id)).toEqual([2, 3, 4]); expect(result.local.map(order => order.id)).toEqual(['draft']);
  });
});
