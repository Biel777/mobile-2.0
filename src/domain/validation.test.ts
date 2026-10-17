import { describe, expect, it } from 'vitest';
import { fixtures } from '../data/fixtures';
import { canSubmit, validateLine, validateOrder } from './validation';

describe('validações de pedido', () => {
  it('recusa quantidade fora do fracionamento', () => {
    const issues = validateLine(fixtures.tables[0], '78910001', 10);
    expect(issues.some((issue) => issue.code === 'PACK')).toBe(true);
  });

  it('recusa produto fora da folha', () => {
    const issues = validateLine(fixtures.tables[0], '000', 6);
    expect(issues[0].code).toBe('NOT_ON_TABLE');
  });

  it('bloqueia envio abaixo do valor mínimo', () => {
    const issues = validateOrder({
      table: fixtures.tables[0],
      customer: fixtures.customers[0],
      lines: [{ ean: '78910002', quantity: 6 }],
    });
    expect(issues.some((issue) => issue.code === 'MIN_VALUE')).toBe(true);
    expect(canSubmit(issues)).toBe(false);
  });

  it('bloqueia combo com participação insuficiente', () => {
    const issues = validateOrder({
      table: fixtures.tables[1],
      customer: fixtures.customers[1],
      lines: [
        { ean: '78920001', quantity: 6 },
        { ean: '78920002', quantity: 30 },
      ],
    });
    expect(issues.some((issue) => issue.code === 'COMBO')).toBe(true);
  });

  it('bloqueia PDV sem área e pedido sem itens', () => {
    const issues = validateOrder({
      table: fixtures.tables[0],
      customer: fixtures.customers[2],
      lines: [],
    });
    expect(issues.some((issue) => issue.code === 'NO_AREA')).toBe(true);
    expect(issues.some((issue) => issue.code === 'EMPTY')).toBe(true);
  });
});

it('bloqueia revisão por link direto quando o vínculo de área está ausente apesar da flag positiva', () => {
  const issues = validateOrder({ table: fixtures.tables[0], customer: { ...fixtures.customers[0], hasSalesArea: true, areaId: 0 },
    lines: [{ ean: '78910001', quantity: 120 }], now: new Date('2026-10-17T12:00:00Z') });
  expect(issues.some(issue => issue.code === 'NO_AREA' && issue.blocking)).toBe(true);
  expect(canSubmit(issues)).toBe(false);
});
