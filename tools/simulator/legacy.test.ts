import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSimulator } from './server';
import { createLegacyClient } from '@tradetools/legacy';
let server: Server; let base: string;
beforeEach(async () => { server = createSimulator().server; await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; });
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
function form(route: string, fields: Record<string, string>, method = 'POST') {
  const body = new URLSearchParams(fields); const url = `${base}/index.php?r=api/${route}`;
  return fetch(method === 'GET' ? url + '&' + body.toString() : url, { method, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, ...(method === 'POST' ? { body: body.toString() } : {}) });
}
describe('Legacy forms reais contra amostras sintéticas', () => {
  it('autentica, renova sessão, exige codigo sync e mascara logs de query', async () => {
    const auth = await (await form('authentication/new', { 'user[login]': 'marina', 'user[senha]': 'demo', 'user[imei]': 'teste', 'user[versao]': '0.1' })).json();
    expect(auth.id_usuario).toBe(77); expect(auth.id_nivel).toBe(1);
    const fields = { 'user[login]': 'marina', 'user[token]': auth.token, 'user[codigo_sincronizacao]': auth.codigo_sincronizacao };
    expect((await form('clientes/index', { ...fields, 'user[codigo_sincronizacao]': 'invalido' })).status).toBe(401);
    expect((await form('session/new', { 'user[login]': 'marina', 'user[token]': auth.token, 'user[versao]': '0.1' })).status).toBe(200);
    expect((await form('negociacoes/index', { ...fields, 'extras[somente_mobile]': '1' }, 'GET')).status).toBe(200);
    const logs = await (await fetch(base + '/__sim/logs', { headers: { Authorization: `Bearer ${auth.token}` } })).json();
    expect(JSON.stringify(logs)).not.toContain(auth.token); expect(JSON.stringify(logs)).not.toContain(auth.codigo_sincronizacao);
    expect(logs.logs.some((l: any) => l.path === '/index.php?r=api/negociacoes/index')).toBe(true);
  });
  it('adaptador faz bootstrap, envia form correto, consulta status e fatura', async () => {
    const captured: { url: string; body: string }[] = [];
    const client = createLegacyClient({ baseUrl: base, fetchImpl: ((input: any, init: any) => { captured.push({ url: String(input), body: String(init?.body ?? '') }); return fetch(input, init); }) as typeof fetch });
    const session = await client.login('marina', 'demo');
    const data = await client.getBootstrap();
    expect(data.customers.length).toBeGreaterThan(0); expect(data.tables.length).toBeGreaterThan(0);
    expect(data.customers[0].distributors[0].codigoFaturamentoPorPrazo?.[21]).toBe('CF-501-21');
    const body = { order_client_id: crypto.randomUUID(), id_cliente: 11, id_tabela: 101, id_usuario: 77, datahora_criacao: '2026-10-16T22:00:00Z', array_ordem_envio: [{ id_distribuidor: 501, prioridade: 1, tipo_envio: 2 as const, prazo: 21, codigo_faturamento: 'CF-501-21' }], array_produtos: [{ ean: '78910001', quantidade: 120, desconto: 25 }] };
    const result = await client.submitOrder(body);
    expect(result.id_pedido_gerado).toBe(9000); expect(result.id_status).toBe(4);
    expect((await client.submitOrder(body)).id_pedido_gerado).toBe(9000);
    const sent = new URLSearchParams(captured.find(c => c.url.includes('receberPedidoMobile'))!.body);
    expect(sent.get('id_usuario')).toBeNull(); expect(sent.get('datahora_criacao')).toBe('2026-10-16 19:00:00');
    expect(sent.get('ordem_envio[0][codigo_faturamento]')).toBe('CF-501-21'); expect(sent.get('ordem_envio[0][prazo]')).toBeNull();
    expect(sent.get('produtos[0][desconto]')).toBe('25');
    const tracked = await client.listOrders();
    expect(tracked.find(order => order.orderClientId === body.order_client_id)).toMatchObject({ customerId: 11, customerCnpj: '12.345.678/0001-90' });
    expect(tracked.find(order => order.id === 8804)).toMatchObject({ customerId: 22, customerCnpj: '98.765.432/0001-10' });
    expect(tracked.filter(o => o.orderClientId === body.order_client_id)).toHaveLength(1);
    expect(tracked.find(o => o.id === 8814)?.status).toBe(14);
    await fetch(base + '/__sim/orders/transition', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ orderClientId: body.order_client_id, action: 'invoice' }) });
    const order = (await client.listOrders()).find(o => o.orderClientId === body.order_client_id)!;
    expect(order.subOrders[0].invoice?.number).toContain('NF-'); expect(order.subOrders[0].items[0].quantNot).toBe(120);
    expect((await client.getGoals()).metaValor).toBeGreaterThan(0);
  });
  it('recusa codigo fictício desconhecido e desconto ausente no transporte', async () => {
    const auth = await (await form('authentication/new', { 'user[login]': 'marina', 'user[senha]': 'demo', 'user[imei]': 'teste', 'user[versao]': '0.1' })).json();
    const fields = { 'user[login]': 'marina', 'user[token]': auth.token, 'user[codigo_sincronizacao]': auth.codigo_sincronizacao, order_client_id: 'form-test', id_cliente: '11', id_tabela: '101', datahora_criacao: '2026-10-16 19:00:00', 'ordem_envio[0][id_distribuidor]': '501', 'ordem_envio[0][prioridade]': '1', 'ordem_envio[0][codigo_faturamento]': 'INVALIDO', 'produtos[0][ean]': '78910001', 'produtos[0][quantidade]': '120', 'produtos[0][desconto]': '25' };
    expect((await form('pedidos/receberPedidoMobile', fields)).status).toBe(400);
    const { ['produtos[0][desconto]']: discount, ...withoutDiscount } = fields;
    expect((await form('pedidos/receberPedidoMobile', withoutDiscount)).status).toBe(400);
    expect((await form('pedidos/receberPedidoMobile', { ...fields, 'ordem_envio[0][codigo_faturamento]': 'CF-501-21' })).status).toBe(200);
  });
  it('recupera confirmação perdida sem duplicar e preserva agendamento', async () => {
    const client = createLegacyClient({ baseUrl: base, schedulePeriod: '09:30' });
    const session = await client.login('marina', 'demo');
    await fetch(base + '/__sim/scenario', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.token }, body: JSON.stringify({ scenario: 'lost-response' }) });
    const body = { order_client_id: crypto.randomUUID(), id_cliente: 11, id_tabela: 101, id_usuario: 77, datahora_criacao: '2026-10-16T22:00:00Z', array_ordem_envio: [{ id_distribuidor: 501, prioridade: 1, tipo_envio: 2 as const, prazo: 21, codigo_faturamento: 'CF-501-21' }], array_produtos: [{ ean: '78910001', quantidade: 120, desconto: 25 }], array_agendamento: [{ data_envio: '2030-12-01' }] };
    await expect(client.submitOrder(body)).rejects.toMatchObject({ status: 503 });
    const retry = await client.submitOrder(body); expect(retry.id_pedido_gerado).toBe(9000); expect(retry.id_status).toBe(3);
    const orders = (await client.listOrders()).filter(o => o.orderClientId === body.order_client_id);
    expect(orders).toHaveLength(1); expect(orders[0].dataEnvio).toBe('2030-12-01');
  });

});
