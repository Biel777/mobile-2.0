import type { Goals } from '@rules/types';
import { ORDER_STATUS } from '@rules/status';
import { mobileContractChecks, SalesApiError } from './http';
export type Raw = Record<string, any>;
export const incomplete = (message: string): never => { throw new SalesApiError(`Contrato Legacy incompleto: ${message}`, 'INCOMPLETE_CONTRACT'); };
export function record(value: unknown): Raw { if (!value || typeof value !== 'object' || Array.isArray(value)) return incomplete('objeto esperado'); return value; }
export function list(value: unknown, label: string): Raw[] { if (!Array.isArray(value) || value.some(v => !v || typeof v !== 'object' || Array.isArray(v))) return incomplete(`${label}: lista ausente ou inválida`); return value; }
export function string(value: unknown, label: string): string { if (typeof value !== 'string') return incomplete(`${label}: texto ausente`); return value; }
export function numeric(value: unknown, label: string): number { if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) return incomplete(`${label}: número ausente`); return Number(value); }
export function flag(value: unknown, label: string): boolean { if (![true, false, 0, 1, '0', '1'].includes(value as any)) return incomplete(`${label}: booleano ausente`); return value === true || value === 1 || value === '1'; }
/** A neutral field wins; a single legacy area alias is accepted without guessing between flags. */
export function customerAreaFlag(customer: Raw): boolean {
  if (Object.prototype.hasOwnProperty.call(customer, 'tem_area')) return flag(customer.tem_area, 'tem_area');
  const aliases = Object.keys(customer).filter(key => key.startsWith('tem_area_'));
  if (aliases.length !== 1) return incomplete('tem_area: campo ausente ou aliases ambíguos');
  return flag(customer[aliases[0]], 'tem_area');
}
const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function legacyStatus(value: unknown): number {
  const text = string(value, 'descrição do status');
  const aliases: Record<string, number> = { 'aceito com sucesso': 1, 'sem resposta': 4, 'nao aceito pelo distribuidor': 6,
    'aberto para digitacao': 7, 'pendente margem diferenciada': 13, 'devolvido parcial': 15, 'devolvido integral': 16,
    'devolvido parcialmente': 15, 'devolvido integralmente': 16 };
  if (Object.prototype.hasOwnProperty.call(aliases, normalize(text))) return aliases[normalize(text)];
  const found = Object.entries(ORDER_STATUS).find(([, label]) => normalize(label) === normalize(text));
  if (!found) return incomplete(`status desconhecido: ${text}`);
  return Number(found[0]);
}
export function pdv(v: Raw) { return { id: numeric(v.id ?? v.id_cliente, 'id_cliente'), name: string(v.nome_fantasia || v.razao_social || v.nome, 'nome PDV'), city: string(v.cidade, 'cidade') }; }
export function mapLegacyGoals(raw: unknown): Goals {
  const v = record(raw);
  const goals: Goals = {
    periodLabel: string(v.periodo, 'periodo'), metaValor: numeric(v.meta_valor, 'meta_valor'), realizadoValor: numeric(v.realizado_valor, 'realizado_valor'),
    metaQtd: numeric(v.meta_quantidade, 'meta_quantidade'), realizadoQtd: numeric(v.realizado_quantidade, 'realizado_quantidade'),
    pdvsCarteira: numeric(v.pdvs_carteira, 'pdvs_carteira'), pdvsPositivados: numeric(v.pdvs_positivados, 'pdvs_positivados'),
    pdvsSemPositivar: list(v.pdvs_sem_positivar, 'pdvs_sem_positivar').map(pdv),
    families: list(v.familias, 'familias').map(f => ({ family: string(f.familia, 'familia'), metaPdvs: numeric(f.meta_pdvs, 'meta_pdvs'), faturados: numeric(f.faturados, 'faturados'), semPositivar: list(f.sem_positivar, 'sem_positivar').map(pdv) })),
  };
  if (!mobileContractChecks.goals(goals)) return incomplete('metas incompatíveis');
  return goals;
}
export function mapProduct(price: Raw, catalog: Raw[]) {
  const info = catalog.find(p => p.ean === price.ean);
  if (!info) return incomplete('produto sem cadastro global');
  return {
    ean: string(price.ean, 'ean'), name: string(info.nome, 'nome produto'), family: info.familia,
    listPrice: numeric(price.preco_lista, 'preco_lista'), baseDiscount: numeric(price.desconto_base, 'desconto_base'),
    minQty: numeric(price.quantidade_minima, 'quantidade_minima'), maxQty: price.quantidade_maxima === undefined ? undefined : numeric(price.quantidade_maxima, 'quantidade_maxima'),
    packSize: numeric(price.multiplo, 'multiplo'), required: price.obrigatoriedade,
    isCombo: price.combo === undefined ? undefined : flag(price.combo, 'combo'),
    ceilingDiscount: price.desconto_teto === undefined ? undefined : numeric(price.desconto_teto, 'desconto_teto'),
    photoRestricted: info.foto_restrita === undefined ? undefined : flag(info.foto_restrita, 'foto_restrita'),
    tiers: list(price.faixas, 'faixas').map(t => ({ quantMin: numeric(t.quantidade_minima, 'quantidade_minima faixa'), percent: numeric(t.percentual, 'percentual') })),
  };
}
