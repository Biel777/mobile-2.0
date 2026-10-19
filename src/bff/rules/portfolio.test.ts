import { describe, expect, it } from 'vitest';
import { fixtures } from '@data/fixtures';
import { filterPortfolioRefs, isPortfolioCustomer } from './portfolio';
import { getVisitCustomers } from './visits';

describe('carteira por vínculo de área', () => {
  it('exige vínculo e identificador positivo sem comparar nomes de área', () => {
    expect(isPortfolioCustomer({ hasSalesArea: true, areaId: 17 })).toBe(true);
    for (const customer of [
      { hasSalesArea: false, areaId: 17 },
      { hasSalesArea: true, areaId: 0 },
      { hasSalesArea: true, areaId: -1 },
      { hasSalesArea: true, areaId: NaN },
    ])
      expect(isPortfolioCustomer(customer)).toBe(false);
  });
  it('exclui referência conhecida sem área e mantém referência fora do cache parcial', () => {
    const customers = [
      { ...fixtures.customers[0], id: 1, hasSalesArea: true, areaId: 7 },
      { ...fixtures.customers[0], id: 2, hasSalesArea: false, areaId: 0 },
    ];
    const refs = [1, 2, 3].map((id) => ({ id, name: 'Mesmo nome', city: 'Campinas' }));
    expect(filterPortfolioRefs(refs, customers).map((customer) => customer.id)).toEqual([1, 3]);
  });
  it('não reintroduz loja bloqueada pelas referências das metas na agenda', () => {
    const catalog = structuredClone(fixtures);
    const blocked = { ...catalog.customers[0], id: 99, hasSalesArea: false, areaId: 0 };
    catalog.customers.push(blocked);
    const refs = [
      { id: 99, name: blocked.name, city: blocked.city },
      { id: 999, name: 'Cache parcial', city: 'SP' },
    ];
    catalog.goals.pdvsSemPositivar.push(...refs);
    catalog.goals.families[0].semPositivar.push(...refs);
    const visible = getVisitCustomers(catalog);
    expect(visible.some((customer) => customer.id === 99)).toBe(false);
    expect(visible.filter((customer) => customer.id === 999)).toHaveLength(1);
  });
});
