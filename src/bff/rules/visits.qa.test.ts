import { describe, expect, it } from 'vitest';
import { fixtures } from '@data/fixtures';
import { getCustomerOrders } from './visits';
import type { LocalOrder, TrackedOrder } from './types';

const customer = { id: 11, name: 'PDV', city: 'Cidade', cnpj: '12.345.678/0001-90' };
const local = (id: string, remoteId?: number): LocalOrder => ({ id, orderClientId: id, remoteId, customerId: 11,
  tableId: 101, userId: 1, createdAt: '2026-10-17T10:00:00Z', lines: [], distributorIds: [], prazos: {}, localStatus: 7 });
const remote = (id: number, changes: Partial<TrackedOrder> = {}): TrackedOrder => ({ ...structuredClone(fixtures.tracked[0]),
  id, customerId: undefined, customerCnpj: undefined, orderClientId: '', customerName: customer.name, ...changes });

describe('QA independente da identidade na preparação de visitas', () => {
  it('ID remoto prevalece sobre nome, CNPJ e alias local contraditórios', () => {
    const draft = local('local-1', 100);
    const result = getCustomerOrders(customer, [remote(100, { customerId: 99, customerCnpj: customer.cnpj, orderClientId: draft.orderClientId })], [draft]);
    expect(result.tracked).toEqual([]);
    expect(result.local).toEqual([draft]);
  });

  it('usa CNPJ formatado somente quando não existe ID de cliente e sem duplicar o pedido local', () => {
    const draft = local('local-1', 100);
    const result = getCustomerOrders(customer, [remote(100, { customerCnpj: '12345678000190' })], [draft]);
    expect(result.tracked.map(order => order.id)).toEqual([100]);
    expect(result.local).toEqual([]);
  });

  it('não associa pedidos por igualdade de nomes ou ausência de identificadores', () => {
    const draft = local('local-1');
    const result = getCustomerOrders(customer, [remote(100), remote(101, { customerCnpj: '98.765.432/0001-10' })], [draft]);
    expect(result.tracked).toEqual([]);
    expect(result.local).toEqual([draft]);
  });
});
