import { ORDER_STATUS } from '@rules/status';
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fixtures } from '../../src/data/fixtures';
import type { createMockClient } from '@tradetools/mock';
import type { SubmitOrderPayload } from '@rules/types';

type Response = { status: number; data: unknown };
type Session = { login: string; code: string; userId: number };
export function createLegacySimulator(options: {
  mock: ReturnType<typeof createMockClient>;
  registerToken: (token: string, userId: number) => void;
  submit: (payload: SubmitOrderPayload) => Promise<{ status: number; data: any }>;
  scenario: () => string;
}) {
  const sessions = new Map<string, Session>();
  const ok = (data: object): Response => ({ status: 200, data: { status: 'ok', ...data } });
  const error = (status: number, message: string): Response => ({ status, data: { status: 'erro', message, mensagem: message } });
  return async (req: IncomingMessage, url: URL, form: URLSearchParams): Promise<Response> => {
    const route = url.searchParams.get('r');
    const get = (key: string) => form.get(key) ?? url.searchParams.get(key);
    if (route === 'api/authentication/new' && req.method === 'POST') {
      const login = get('user[login]'); const password = get('user[senha]');
      if (!login || !password || password.length < 3 || !get('user[imei]') || !get('user[versao]')) return error(401, 'Credenciais fictícias ou dispositivo inválidos');
      const token = randomUUID(); const code = randomUUID();
      sessions.set(token, { login, code, userId: fixtures.user.id }); options.registerToken(token, fixtures.user.id);
      return ok({ login, token, codigo_sincronizacao: code, id_usuario: fixtures.user.id, id_nivel: 1, nome: fixtures.user.name });
    }
    const token = get('user[token]') ?? get('token');
    const session = token ? sessions.get(token) : undefined;
    if (!session) return error(401, 'Sessão Legacy inválida');
    if (route === 'api/session/new' && req.method === 'POST') { if (get('user[login]') !== session.login || !get('user[versao]')) return error(401, 'Renovação exige login e versão'); return ok({ codigo_sincronizacao: session.code }); }
    if (get('user[login]') !== session.login || get('user[codigo_sincronizacao]') !== session.code) return error(401, 'Login ou código de sincronização inválido');
    if (options.scenario() === 'latency') await new Promise(resolve => setTimeout(resolve, 2500));
    if (options.scenario() === 'unauthorized') return error(401, 'Sessão expirada (simulação)');
    if (options.scenario() === 'server-error') return error(500, 'Falha temporária (simulação)');
    if (route === 'api/clientes/index' && req.method === 'POST') return ok({ clientes: fixtures.customers.map(c => ({ id_cliente: c.id, nome: c.name, cnpj: c.cnpj, cidade: c.city, id_area: c.areaId, tem_area: c.hasSalesArea ? 1 : 0 })) });
    if (route === 'api/negociacoes/index' && req.method === 'GET') return ok({ negociacoes: fixtures.tables.map(t => ({ id_tabela: t.id, nome: t.name, valor_minimo: t.minValue, base_minimo: t.minValueBasis, participacao_combo: t.comboParticipation, faturado_mes: t.monthBilledNet, permitir_dividir_pedidos_agendados: t.dividePedido ? 1 : 0, data_validade: t.expiresAt, somente_mobile: t.onlyMobile ? 1 : 0, gatilhos: t.triggers.map(r => ({ ean_gatilho: r.triggerEan, quantidade: r.threshold, ean_filho: r.childEan, percentual_extra: r.extraPercent })) })) });
    if (route === 'api/clientes/getClientesTabelasNegociacoes' && req.method === 'POST') return ok({ vinculos: fixtures.customers.flatMap(c => c.tableIds.map(id => ({ id_cliente: c.id, id_tabela: id }))) });
    if (route === 'api/produtos/index' && req.method === 'POST') return ok({ produtos: [...new Map(fixtures.tables.flatMap(t => t.products).map(p => [p.ean, { ean: p.ean, nome: p.name, familia: p.family, foto_restrita: p.photoRestricted ? 1 : 0 }])).values()] });
    if (route === 'api/produtos/getProdutosDaTabela' && req.method === 'POST') {
      const table = fixtures.tables.find(t => t.id === Number(get('id_tabela') ?? get('extras[id_tabela]')));
      if (!table) return error(400, 'Tabela não encontrada');
      const scope = fixtures.customers.find(c => c.id === Number(get('id_cliente')));
      if (!scope || !scope.tableIds.includes(table.id) || !scope.distributors.some(d => d.id === Number(get('id_distribuidor')))) return error(400, 'Preço exige combinação válida de cliente, tabela e distribuidor');
      return ok({ produtos: table.products.map(p => ({ ean: p.ean, preco_lista: p.listPrice, desconto_base: p.baseDiscount, quantidade_minima: p.minQty, quantidade_maxima: p.maxQty, multiplo: p.packSize, obrigatoriedade: p.required, combo: p.isCombo ? 1 : 0, desconto_teto: p.ceilingDiscount, faixas: p.tiers.map(t => ({ quantidade_minima: t.quantMin, percentual: t.percent })) })) });
    }
    if (route === 'api/clientes/getDistribuidores' && req.method === 'GET') {
      const customer = fixtures.customers.find(c => c.cnpj === get('cnpj_cliente'));
      return customer ? ok({ distribuidores: customer.distributors.map(d => ({ id_distribuidor: d.id, nome: d.name, prioridade: d.priority, tipo_envio: d.tipoEnvio, prazos: d.prazos, codigo_faturamento_por_prazo: Object.fromEntries(d.prazos.map(prazo => [prazo, `CF-${d.id}-${prazo}`])) })) }) : error(400, 'Cliente não encontrado');
    }
    if (route === 'api/pedidos/receberPedidoMobile' && req.method === 'POST') {
      if (get('id_usuario') !== null || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(get('datahora_criacao') ?? '')) return error(400, 'Use datahora_criacao SQL local e omita id_usuario');
      if (get('cupom')) return error(400, 'Canal de cupom não documentado para Legacy');
      const distributors = indexed(form, 'ordem_envio'); const products = indexed(form, 'produtos'); const schedule = indexed(form, 'agendamento');
      if (!products.length || products.some(p => !p.desconto || !Number.isFinite(Number(p.desconto)))) return error(400, 'Informe desconto numérico em cada produto');
      const customer = fixtures.customers.find(c => c.id === Number(get('id_cliente')));
      if (!customer || distributors.some(d => !customer.distributors.some(allowed => allowed.id === Number(d.id_distribuidor) && allowed.prazos.some(prazo => d.codigo_faturamento === `CF-${allowed.id}-${prazo}`)))) return error(400, 'Código de faturamento não corresponde ao prazo/distribuidor');
      if (schedule.some(d => !d.data || !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.periodo ?? ''))) return error(400, 'Agendamento exige data e periodo');
      const body: SubmitOrderPayload = { order_client_id: get('order_client_id') ?? '', id_cliente: customer.id, id_tabela: Number(get('id_tabela')), id_usuario: session.userId, datahora_criacao: (get('datahora_criacao') ?? '').replace(' ', 'T'), array_ordem_envio: distributors.map((d, i) => ({ id_distribuidor: Number(d.id_distribuidor), prioridade: Number(d.prioridade ?? i + 1), tipo_envio: customer.distributors.find(allowed => allowed.id === Number(d.id_distribuidor))!.tipoEnvio, prazo: customer.distributors.find(allowed => allowed.id === Number(d.id_distribuidor))!.prazos.find(prazo => d.codigo_faturamento === `CF-${d.id_distribuidor}-${prazo}`)! })), array_produtos: products.map(p => ({ ean: p.ean, quantidade: Number(p.quantidade), desconto: Number(p.desconto) })), ...(schedule.length ? { array_agendamento: schedule.map(d => ({ data_envio: d.data })) } : {}), ...(get('cupom') ? { cupom: get('cupom')! } : {}) };
      const response = await options.submit(body);
      if (response.status !== 200) return response;
      const result = response.data;
      return result.id_pedido_gerado ? ok({ id_pedido: result.id_pedido_gerado }) : { status: 200, data: { status: 'erro', erros_envio: result.erros_envio, message: result.erros_envio.join('; '), mensagem: result.erros_envio.join('; '), errors: result.erros_envio } };
    }
    const orders = await options.mock.client.listOrders();
    if (route === 'api/pedidos/getStatusPedidos' && req.method === 'GET') return ok({ pedidos: orders.map(o => ({ id: o.id, order_client_id: o.orderClientId, status: statusDescription(o.status), data_envio: o.dataEnvio, datahora_criacao: o.createdAt, id_cliente: o.customerId, nome_cliente: o.customerName, nome_tabela: o.tableName, prazo: o.prazo })) });
    if (route === 'api/subPedidos/index' && req.method === 'POST') return ok({ subPedidos: orders.flatMap(o => o.subOrders.map(s => ({ id_subpedido: s.id, pedido_id: o.id, order_client_id: o.orderClientId, id_cliente: o.customerId, cliente: o.customerName, tabela: o.tableName, data_envio: o.dataEnvio, data_criacao: o.createdAt, status_id: s.status, status_ds: statusDescription(s.status), cnpj_cliente: o.customerCnpj, distribuidor: s.distributorName, prazo: s.prazo, produtos: s.items.map(i => ({ ean: i.ean, nome: i.name, preco: i.unitPrice, desconto: i.discountPercent, quantidade_pedida: i.quantPed, quantidade_prevista: i.quantEsp, quantidade_confirmada: i.quantNot, motivo: i.reason })) }))) });
    if (route === 'api/nota/index' && req.method === 'POST') return ok({ notas: orders.flatMap(o => o.subOrders.filter(s => s.invoice).map(s => ({ id_subpedido: s.id, id_pedido: o.id, numero: s.invoice!.number, valor: s.invoice!.value, data_emissao: s.invoice!.issuedAt }))) });
    if (route === 'api/metas/desempenhoArea' && req.method === 'POST') { const g = fixtures.goals; const pdv = (p: {id:number;name:string;city:string}) => ({ id_cliente: p.id, nome: p.name, cidade: p.city }); return ok({ periodo: g.periodLabel, meta_valor: g.metaValor, realizado_valor: g.realizadoValor, meta_quantidade: g.metaQtd, realizado_quantidade: g.realizadoQtd, pdvs_carteira: g.pdvsCarteira, pdvs_positivados: g.pdvsPositivados, pdvs_sem_positivar: g.pdvsSemPositivar.map(pdv), familias: g.families.map(f => ({ familia: f.family, meta_pdvs: f.metaPdvs, faturados: f.faturados, sem_positivar: f.semPositivar.map(pdv) })) }); }
    return error(404, 'Endpoint Legacy não encontrado');
  };
}
export function indexed(form: URLSearchParams, prefix: string): Record<string, string>[] {
  const rows = new Map<number, Record<string, string>>();
  form.forEach((value, key) => {
    const match = /^([a-z_]+)\[(\d+)\]\[([a-z_]+)\]$/.exec(key);
    if (!match || match[1] !== prefix || ['__proto__', 'constructor', 'prototype'].includes(match[3])) return;
    const index = Number(match[2]); if (index > 1000) return;
    const row = rows.get(index) ?? Object.create(null); row[match[3]] = value; rows.set(index, row);
  });
  return [...rows.entries()].sort(([a], [b]) => a - b).map(([, row]) => row);
}
function statusDescription(status: number) {
  const description = ORDER_STATUS[status];
  if (!description) throw new Error(`Status não mapeado no simulador: ${status}`);
  return description;
}
