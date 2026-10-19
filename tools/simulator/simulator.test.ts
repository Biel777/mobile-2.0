import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSimulator } from './server';
import { createHttpClient } from '@tradetools/http';
let server: Server; let base: string; let token: string;
const payload = () => ({ order_client_id: crypto.randomUUID(), id_cliente: 11, id_tabela: 101, id_usuario: 77, datahora_criacao: new Date().toISOString(), array_ordem_envio: [{ id_distribuidor: 501, prioridade: 1, tipo_envio: 2, prazo: 21 }], array_produtos: [{ ean: '78910001', quantidade: 120 }] });
async function request(path: string, method = 'GET', body?: unknown, customHeaders: Record<string, string> = {}) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...customHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
beforeEach(async () => {
  server = createSimulator().server;
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`; token = '';
  token = (await request('/api/mobile/v1/auth/login', 'POST', { login: 'marina', password: 'demo' })).body.token;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
describe('Simulador HTTP isolado', () => {
  it('integra o adaptador HTTP real com autenticação, bootstrap, envio e consulta', async () => {
    const client = createHttpClient({ baseUrl: base, getToken: () => token });
    const session = await client.login('marina', 'demo'); token = session.token;
    const bootstrap = await client.getBootstrap(); expect(bootstrap.user.id).toBe(session.userId);
    const body = payload();
    const result = await client.submitOrder(body as any); expect(result.id_pedido_gerado).toBe(9000);
    expect((await client.listOrders()).some(order => order.orderClientId === body.order_client_id)).toBe(true);
    expect((await client.getGoals()).metaValor).toBeGreaterThan(0);
  });
  it('permite comprovar timeout do cliente sob latência e recuperar', async () => {
    await request('/__sim/scenario', 'POST', { scenario: 'latency' });
    const client = createHttpClient({ baseUrl: base, getToken: () => token, timeoutMs: 20 });
    await expect(client.getGoals()).rejects.toMatchObject({ code: 'TIMEOUT' });
    await request('/__sim/scenario', 'POST', { scenario: 'normal' });
    expect((await request('/api/mobile/v1/goals')).status).toBe(200);
  });
  it('serve painel, exige autenticação e entrega cadastros/metas', async () => {
    expect(await (await fetch(base)).text()).toContain('Laboratório de integração');
    const authenticated = token; token = '';
    expect((await request('/api/mobile/v1/bootstrap')).status).toBe(401); token = authenticated;
    const bootstrap = await request('/api/mobile/v1/bootstrap');
    expect(bootstrap.status).toBe(200); expect(bootstrap.body.customers.length).toBeGreaterThan(0);
    expect(bootstrap.body.user.id).toBe(77); expect(bootstrap.body.tracked).toBeUndefined();
    expect((await request('/api/mobile/v1/goals')).body.metaValor).toBeGreaterThan(0);
  });
  it('aceita pedido, perde confirmação e deduplica reenvio sem alterar pedido', async () => {
    const body = payload(); const headers = { 'Idempotency-Key': body.order_client_id };
    await request('/__sim/scenario', 'POST', { scenario: 'lost-response' });
    expect((await request('/api/mobile/v1/orders', 'POST', body, headers)).status).toBe(503);
    const retry = await request('/api/mobile/v1/orders', 'POST', body, headers);
    expect(retry.body.id_pedido_gerado).toBe(9000);
    const orders = (await request('/api/mobile/v1/orders')).body;
    expect(orders.filter((o: any) => o.orderClientId === body.order_client_id)).toHaveLength(1);
    expect((await request('/api/mobile/v1/orders', 'POST', { ...body, justificativa: 'outro' }, headers)).status).toBe(409);
  });
  it('permite parcial, rejeição, faturamento e reset independente', async () => {
    const body = payload(); await request('/api/mobile/v1/orders', 'POST', body, { 'Idempotency-Key': body.order_client_id });
    for (const [action, status] of [['partial', 10], ['reject', 11], ['invoice', 1]]) {
      expect((await request('/__sim/orders/transition', 'POST', { orderClientId: body.order_client_id, action })).status).toBe(200);
      const order = (await request('/api/mobile/v1/orders')).body.find((o: any) => o.orderClientId === body.order_client_id);
      expect(order.status).toBe(status); if (action === 'invoice') expect(order.subOrders[0].invoice.number).toContain('NF-');
    }
    await request('/__sim/reset', 'POST', {});
    expect((await request('/api/mobile/v1/orders')).body.some((o: any) => o.orderClientId === body.order_client_id)).toBe(false);
  });
  it('simula 500 e 401 recuperáveis, não registra credenciais', async () => {
    for (const [scenario, status] of [['server-error', 500], ['unauthorized', 401]]) {
      await request('/__sim/scenario', 'POST', { scenario });
      expect((await request('/api/mobile/v1/goals')).status).toBe(status);
    }
    await request('/__sim/scenario', 'POST', { scenario: 'normal' });
    expect((await request('/api/mobile/v1/goals')).status).toBe(200);
    const log = JSON.stringify((await request('/__sim/logs')).body.logs);
    expect(log).not.toContain(token); expect(log).not.toContain('password'); expect(log).not.toContain('demo');
  });
  it('rejeita origem estranha, distribuidor inválido e chave ausente', async () => {
    expect((await request('/api/mobile/v1/goals', 'GET', undefined, { Origin: 'https://malicioso.example' })).status).toBe(403);
    const body = payload(); expect((await request('/api/mobile/v1/orders', 'POST', body)).status).toBe(400);
    body.array_ordem_envio[0].id_distribuidor = 99999;
    expect((await request('/api/mobile/v1/orders', 'POST', body, { 'Idempotency-Key': body.order_client_id })).status).toBe(400);
  });
  it('valida JSON malformado e limite de corpo', async () => {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    expect((await fetch(base + '/api/mobile/v1/orders', { method: 'POST', headers, body: '{bad' })).status).toBe(400);
    expect((await fetch(base + '/api/mobile/v1/orders', { method: 'POST', headers, body: JSON.stringify({ text: 'a'.repeat(300000) }) })).status).toBe(413);
  });
});
