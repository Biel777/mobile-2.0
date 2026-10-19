import { describe, expect, it } from 'vitest';
import { validateDistributorSelection } from './order-distributors';
import type { Distributor } from './types';
const released: Distributor[] = [
  { id: 1, name: 'OPL A', priority: 1, tipoEnvio: 1, prazos: [0, 21, 28] },
  { id: 2, name: 'OPL B', priority: 2, tipoEnvio: 1, prazos: [14, 21] },
];

describe('revalidação dos distribuidores na revisão do pedido', () => {
  it('aceita os prazos liberados e preserva o vínculo ao reordenar', () => {
    const prazos = { 1: 28, 2: 14 };
    expect(validateDistributorSelection({ selected: [1, 2], prazos, released })).toEqual([]);
    expect(validateDistributorSelection({ selected: [2, 1], prazos, released })).toEqual([]);
    expect(prazos).toEqual({ 1: 28, 2: 14 });
  });
  it('não escolhe prazo automaticamente e aceita zero somente se explicitamente liberado', () => {
    expect(validateDistributorSelection({ selected: [1], prazos: {}, released })[0].code).toBe(
      'NO_PRAZO_1',
    );
    expect(validateDistributorSelection({ selected: [1], prazos: { 1: 0 }, released })).toEqual([]);
    expect(
      validateDistributorSelection({ selected: [2], prazos: { 2: 0 }, released })[0].code,
    ).toBe('INVALID_PRAZO_2');
  });
  it('bloqueia prazo de rascunho que deixou de ser liberado após sincronização', () => {
    expect(
      validateDistributorSelection({ selected: [1], prazos: { 1: 35 }, released })[0].code,
    ).toBe('INVALID_PRAZO_1');
  });
  it('bloqueia distribuidor removido da carteira mesmo quando ainda existe outro válido', () => {
    const issues = validateDistributorSelection({
      selected: [1, 99],
      prazos: { 1: 21, 99: 21 },
      released,
    });
    expect(issues.map((issue) => issue.code)).toContain('UNAVAILABLE_DIST_99');
    expect(issues.every((issue) => issue.blocking)).toBe(true);
  });
  it('verifica o limite antes de filtrar IDs indisponíveis e rejeita duplicidade', () => {
    expect(
      validateDistributorSelection({ selected: [1, 2, 3, 4, 5, 6, 7], prazos: {}, released }).map(
        (issue) => issue.code,
      ),
    ).toContain('MAX_DIST');
    expect(
      validateDistributorSelection({ selected: [1, 1], prazos: { 1: 21 }, released }).map(
        (issue) => issue.code,
      ),
    ).toContain('DUPLICATE_DIST');
    expect(validateDistributorSelection({ selected: [], prazos: {}, released })[0].code).toBe(
      'NO_DIST',
    );
  });
});
