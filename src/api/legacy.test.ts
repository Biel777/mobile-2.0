import { describe, expect, it, vi } from 'vitest';
import type { Session } from './client';
import { createLegacyClient, mapLegacyGoals, legacyDateTime, legacyStatus } from './legacy';
import type { SubmitOrderPayload } from '../domain/types';

const session: Session = { token: 'legacy-token', userId: 77, name: 'Marina', login: 'marina', codigoSincronizacao: '51' };
const payload: SubmitOrderPayload = {
  order_client_id: 'mobile-123', id_cliente: 11, id_tabela: 101, id_usuario: 77,
  datahora_criacao: '2026-10-16T15:30:45.000Z',
  array_ordem_envio: [{ id_distribuidor: 501, prioridade: 1, tipo_envio: 2, prazo: 28, codigo_faturamento: 'CF-501-28' }],
  array_produtos: [{ ean: '789', quantidade: 30, desconto: 10 }], array_agendamento: [{ data_envio: '2026-11-01' }],
};
const goalsRaw = { status: 'ok', periodo: 'Outubro 2026', meta_valor: 1000, realizado_valor: 100,
  meta_quantidade: 100, realizado_quantidade: 10, pdvs_carteira: 1, pdvs_positivados: 0,
  pdvs_sem_positivar: [{ id_cliente: 11, nome: 'Central', cidade: 'Campinas' }],
  familias: [{ familia: 'Farma', meta_pdvs: 1, faturados: 0, sem_positivar: [] }] };
const raw: Record<string, unknown> = {
  'authentication/new': { status: 'ok', login: 'marina', token: 'legacy-token', codigo_sincronizacao: 51, id_nivel: 1, id_usuario: 77 },
  'session/new': { status: 'ok', codigo_sincronizacao: 52 },
  'clientes/index': { clientes: [{ id_cliente: 11, nome: 'Central', cnpj: '123', cidade: 'Campinas', id_area: 7, tem_area: 1 }] },
  'negociacoes/index': { negociacoes: [{ id_tabela: 101, nome: 'Regular', valor_minimo: 100, base_minimo: 'NET', data_validade: '2026-12-31', somente_mobile: 1, gatilhos: [] }] },
  'clientes/getClientesTabelasNegociacoes': { vinculos: [{ id_cliente: 11, id_tabela: 101 }] },
  'produtos/index': { produtos: [{ ean: '789', nome: 'Medicamento', familia: 'Farma' }] },
  'clientes/getDistribuidores': { distribuidores: [{ id_distribuidor: 501, nome: 'OPL', prioridade: 1, tipo_envio: 2, prazos: [28], codigo_faturamento_por_prazo: { '28': 'CF-501-28' } }] },
  'produtos/getProdutosDaTabela': { produtos: [{ ean: '789', preco_lista: 10, desconto_base: 10, quantidade_minima: 6, multiplo: 6, obrigatoriedade: 'none', faixas: [] }] },
  'metas/desempenhoArea': goalsRaw,
  'pedidos/receberPedidoMobile': { status: 'ok', id_pedido: 882, mensagem: 'Recebido' },
  'pedidos/getStatusPedidos': { pedidos: [{ id: 882, status: 'Aguardando retorno', order_client_id: 'mobile-123', nome_cliente: 'Central', nome_tabela: 'Regular', prazo: 28, datahora_criacao: '2026-10-16 12:30:45' }] },
  'subPedidos/index': { subPedidos: [{ id_subpedido: 8821, pedido_id: 882, status_id: 1, status_ds: 'Aceito', cnpj_cliente: '123', distribuidor: 'OPL', prazo: 28,
    produtos: [{ ean: '789', nome: 'Medicamento', preco: 10, desconto: 10, quantidade_pedida: 30, quantidade_prevista: 25, quantidade_confirmada: 20 }] }] },
  'nota/index': { notas: [{ id_subpedido: 8821, numero: 'NF-123', valor: 180, data_emissao: '2026-10-17' }] },
};
function harness(overrides: Record<string, unknown> = {}) {
  const routes = { ...raw, ...overrides };
  const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (url) => {
    const route = new URL(String(url)).searchParams.get('r')!.replace(/^api\//, '');
    return new Response(JSON.stringify(routes[route]));
  });
  return { fetchImpl, client: createLegacyClient({ baseUrl: 'http://localhost:4010', getSession: () => session, imei: 'device-test', appVersion: '0.2.0', fetchImpl }) };
}

describe('Legacy transporte direto e perfil de leitura do laboratório', () => {
  it('envia login PHP form e usa ID real, nunca id_nivel', async () => {
    const { client, fetchImpl } = harness();
    expect(await client.login('marina', 'secret-test')).toMatchObject({ userId: 77, login: 'marina', codigoSincronizacao: '51' });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('index.php?r=api/authentication/new');
    expect(options?.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const form = new URLSearchParams(String(options?.body));
    const fields: Record<string, string> = {}; form.forEach((v, k) => { fields[k] = v; });
    expect(fields).toEqual({ 'user[login]': 'marina', 'user[senha]': 'secret-test', 'user[imei]': 'device-test', 'user[versao]': '0.2.0' });
    const withoutId = harness({ 'authentication/new': { status: 'ok', token: 't', codigo_sincronizacao: 1, id_nivel: 99 } });
    await expect(withoutId.client.login('marina', 'pwd')).rejects.toMatchObject({ code: 'INCOMPLETE_CONTRACT' });
    const configured = createLegacyClient({ baseUrl: 'http://local', userId: 77, fetchImpl: withoutId.fetchImpl });
    expect((await configured.login('marina', 'pwd')).userId).toBe(77);
  });

  it('renova codigo_sincronizacao e usa sessão restaurada para sync', async () => {
    const { client, fetchImpl } = harness();
    expect(await client.refreshSession!()).toMatchObject({ codigoSincronizacao: '52', token: 'legacy-token' });
    const form = new URLSearchParams(String(fetchImpl.mock.calls[0][1]?.body));
    expect(form.get('user[token]')).toBe('legacy-token');
    expect(form.has('user[senha]')).toBe(false);
  });

  it('carrega cadastros e preços via endpoints Legacy sem fixtures locais', async () => {
    const { client, fetchImpl } = harness();
    const bootstrap = await client.getBootstrap();
    expect(bootstrap.customers[0].distributors[0].codigoFaturamentoPorPrazo).toEqual({ '28': 'CF-501-28' });
    expect(bootstrap.tables[0].products[0]).toMatchObject({ ean: '789', listPrice: 10, baseDiscount: 10 });
    expect(bootstrap.flags).toEqual([]);
    expect(bootstrap.coupons).toEqual([]);
    expect(bootstrap.integrationWarnings?.length).toBeGreaterThan(0);
    const negotiationCall = fetchImpl.mock.calls.find(([url]) => String(url).includes('negociacoes/index'))!;
    expect(negotiationCall[1]?.method).toBe('GET');
    expect(new URL(String(negotiationCall[0])).searchParams.get('extras[somente_mobile]')).toBe('1');
    const prices = fetchImpl.mock.calls.find(([url]) => String(url).includes('getProdutosDaTabela'))!;
    expect(new URLSearchParams(String(prices[1]?.body)).get('id_distribuidor')).toBe('501');
  });

  it('bloqueia leitura incompleta em vez de inventar dados comerciais', async () => {
    const { client } = harness({ 'produtos/getProdutosDaTabela': { produtos: [{ ean: '789', preco_lista: 10 }] } });
    await expect(client.getBootstrap()).rejects.toMatchObject({ code: 'INCOMPLETE_CONTRACT' });
    expect(() => mapLegacyGoals({ familias: [] })).toThrow(/periodo/);
  });

  it('bloqueia preços diferentes por distribuidor enquanto tabela é global no app', async () => {
    const distributor = (raw['clientes/getDistribuidores'] as any).distribuidores[0];
    const { client, fetchImpl } = harness({ 'clientes/getDistribuidores': { distribuidores: [distributor, { ...distributor, id_distribuidor: 502 }] } });
    const original = fetchImpl.getMockImplementation()!;
    fetchImpl.mockImplementation(async (url, options) => {
      if (String(url).includes('getProdutosDaTabela') && new URLSearchParams(String(options?.body)).get('id_distribuidor') === '502') {
        const source = raw['produtos/getProdutosDaTabela'] as any;
        return new Response(JSON.stringify({ produtos: [{ ...source.produtos[0], preco_lista: 99 }] }));
      }
      return original(url, options);
    });
    await expect(client.getBootstrap()).rejects.toMatchObject({ code: 'INCOMPLETE_CONTRACT', message: expect.stringContaining('preços diferentes') });
  });

  it('traduz envio, período e desconto, omite id_usuario e consulta status textual após aceite', async () => {
    const { client, fetchImpl } = harness();
    expect(await client.submitOrder(payload)).toEqual({ id_pedido_gerado: 882, id_status: 4, erros_envio: [] });
    const form = new URLSearchParams(String(fetchImpl.mock.calls[0][1]?.body));
    expect(form.get('datahora_criacao')).toBe('2026-10-16 12:30:45');
    expect(form.get('ordem_envio[0][codigo_faturamento]')).toBe('CF-501-28');
    expect(form.get('produtos[0][desconto]')).toBe('10');
    expect(form.get('agendamento[0][periodo]')).toBe('08:00');
    expect(form.has('id_usuario')).toBe(false);
    expect(form.has('ordem_envio[0][prazo]')).toBe(false);
    expect(form.has('ordem_envio[0][tipo_envio]')).toBe(false);
    expect(form.get('user[codigo_sincronizacao]')).toBe('51');
    expect(new URL(String(fetchImpl.mock.calls[1][0])).searchParams.getAll('pedidos[]')).toEqual(['882']);
  });

  it('mantém rejeição/pré-pedido e confirmação incerta visíveis', async () => {
    const rejected = harness({ 'pedidos/receberPedidoMobile': { status: 'erro', mensagem: 'Bloqueado', errors: ['Mínimo não atingido'], id_pre_pedido: 123 } });
    await expect(rejected.client.submitOrder(payload)).resolves.toMatchObject({ id_pedido_gerado: 0, id_status: 7, erros_envio: [expect.stringContaining('Pré-pedido 123')] });
    const unknown = harness({ 'pedidos/getStatusPedidos': { pedidos: [{ id: 882, status: 'Status desconhecido' }] } });
    await expect(unknown.client.submitOrder(payload)).rejects.toMatchObject({ code: 'STATUS_PENDING', remoteId: 882, message: expect.stringContaining('882') });
    const draft = harness({ 'pedidos/getStatusPedidos': { pedidos: [{ id: 882, status: 'Em digitação' }] } });
    await expect(draft.client.submitOrder(payload)).rejects.toMatchObject({ code: 'STATUS_PENDING' });
  });

  it('bloqueia cupom, código ausente e desconto indefinido antes de chamar API', async () => {
    const { client, fetchImpl } = harness();
    await expect(client.submitOrder({ ...payload, cupom: 'PROMO' })).rejects.toMatchObject({ code: 'UNSUPPORTED_FIELD' });
    await expect(client.submitOrder({ ...payload, array_ordem_envio: [{ ...payload.array_ordem_envio[0], codigo_faturamento: undefined }] })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    await expect(client.submitOrder({ ...payload, array_produtos: [{ ...payload.array_produtos[0], desconto: undefined }] })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('agrega subpedidos e associa quantidades e notas', async () => {
    const { client } = harness();
    const orders = await client.listOrders();
    expect(orders).toHaveLength(1);
    expect(orders[0].subOrders[0].items[0]).toMatchObject({ quantPed: 30, quantEsp: 25, quantNot: 20 });
    expect(orders[0].subOrders[0].invoice).toEqual({ number: 'NF-123', value: 180, issuedAt: '2026-10-17' });
  });

  it('reconcilia ID conhecido usando apenas contrato de status e preserva 401', async () => {
    const { client, fetchImpl } = harness({ 'pedidos/getStatusPedidos': { pedidos: [{ id: 882, status: 'Aceito', data_envio: '2026-10-16' }] } });
    expect(await client.getOrderStatus!(882)).toEqual({ id_pedido_gerado: 882, id_status: 1, erros_envio: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ mensagem: 'Sessão expirada' }), { status: 401 }));
    await expect(client.getOrderStatus!(882)).rejects.toMatchObject({ code: 'STATUS_PENDING', status: 401, remoteId: 882 });
  });

  it('converte fuso explicitamente e recusa data sem fuso ou status desconhecido', () => {
    expect(legacyDateTime('2026-10-17T01:30:00Z')).toBe('2026-10-16 22:30:00');
    expect(legacyDateTime('2026-10-17T01:30:00-03:00')).toBe('2026-10-17 01:30:00');
    expect(() => legacyDateTime('2026-10-17T01:30:00')).toThrow(/fuso/);
    expect(legacyStatus('ACEITO')).toBe(1);
    expect(legacyStatus('Aceito com sucesso')).toBe(1);
    expect(legacyStatus('Sem resposta')).toBe(4);
    expect(legacyStatus('Aberto para digitação')).toBe(7);
    expect(legacyStatus('Não aceito pelo distribuidor')).toBe(6);
    expect(() => legacyStatus('novo-status')).toThrow(/status desconhecido/);
    expect(() => legacyStatus('constructor')).toThrow(/status desconhecido/);
    expect(() => legacyStatus('__proto__')).toThrow(/status desconhecido/);
  });
});

describe('campo neutro de vínculo de área', () => {
  const customer = { id_cliente: 11, nome: 'Central', cnpj: '123', cidade: 'Campinas', id_area: 7 };
  it('aceita alias legado único sem alterar os endpoints', async () => {
    const { client } = harness({ 'clientes/index': { clientes: [{ ...customer, tem_area_external: 1 }] } });
    expect((await client.getBootstrap()).customers[0].hasSalesArea).toBe(true);
  });
  it('preserva false explícito e não procura outro campo para conceder vínculo', async () => {
    const { client } = harness({ 'clientes/index': { clientes: [{ ...customer, tem_area: false, tem_area_external: 1 }] } });
    expect((await client.getBootstrap()).customers[0].hasSalesArea).toBe(false);
  });
  it('rejeita flags ausentes, ambíguas e valores inválidos', async () => {
    for (const flags of [{}, { tem_area_a: 1, tem_area_b: 1 }, { tem_area_external: 'yes' }, { tem_area: null, tem_area_external: 1 }]) {
      const { client } = harness({ 'clientes/index': { clientes: [{ ...customer, ...flags }] } });
      await expect(client.getBootstrap()).rejects.toThrow(/tem_area/);
    }
  });
});
