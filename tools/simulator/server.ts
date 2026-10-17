import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createMockClient } from '../../src/api/mock';
import { createLegacySimulator } from './legacy';
import { fixtures } from '../../src/data/fixtures';
import type { SubmitOrderPayload } from '../../src/domain/types';

export type Scenario = 'normal' | 'latency' | 'server-error' | 'unauthorized' | 'lost-response';
export function createSimulator(options: { allowedOrigins?: string[] } = {}) {
  const mock = createMockClient();
  const sessions = new Map<string, number>();
  const fingerprints = new Map<string, string>();
  const logs: { at: string; method: string; path: string; status: number; durationMs: number }[] = [];
  let scenario: Scenario = 'normal';
  const panel = readFileSync(require('node:path').join(__dirname, 'panel.html'), 'utf8');
  const allowedOrigins = options.allowedOrigins ?? ['http://localhost:8081', 'http://127.0.0.1:8081', 'http://localhost:4010', 'http://127.0.0.1:4010'];
  async function submit(body: SubmitOrderPayload) {
    if (!validPayload(body)) return { status: 400, data: { message: 'Payload inválido' } };
    const fingerprint = JSON.stringify(body); const previous = fingerprints.get(body.order_client_id);
    if (previous && previous !== fingerprint) return { status: 409, data: { message: 'Chave reutilizada com conteúdo diferente' } };
    const result = await mock.client.submitOrder(body);
    if (result.id_pedido_gerado) fingerprints.set(body.order_client_id, fingerprint);
    if (scenario === 'lost-response' && result.id_pedido_gerado && !previous) { scenario = 'normal'; return { status: 503, data: { message: 'Pedido aceito, confirmação perdida (simulação). Reenvie o mesmo payload e chave.' } }; }
    return { status: 200, data: result };
  }
  const legacy = createLegacySimulator({ mock, registerToken: (token, id) => sessions.set(token, id), submit, scenario: () => scenario });
  const server = createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const logPath = path === '/index.php' ? '/index.php?r=' + (url.searchParams.get('r') ?? '').replace(/[^a-zA-Z/]/g, '').slice(0, 80) : path.slice(0, 100);
    res.on('finish', () => {
      if (path === '/__sim/logs') return;
      logs.unshift({ at: new Date().toISOString(), method: req.method ?? 'GET', path: logPath, status: res.statusCode, durationMs: Date.now() - started });
      logs.splice(100);
    });
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    const ownOrigin = `http://${req.headers.host}`;
    if (origin && origin !== ownOrigin && !allowedOrigins.includes(origin)) return json(res, 403, { message: 'Origem não permitida' });
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      if (path === '/' && req.method === 'GET') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(panel); }
      if (path === '/health' && req.method === 'GET') return json(res, 200, { simulator: true, contracts: ['legacy-form-lab', 'mobile/v1'], message: 'Simulação local; não homologa o backend Sales API.' });
      if (path === '/api/mobile/v1/auth/login' && req.method === 'POST') {
        const body = await bodyJson(req);
        if (typeof body.login !== 'string' || typeof body.password !== 'string' || !body.login.trim() || body.password.length < 3) return json(res, 401, { message: 'Informe login e senha com pelo menos três caracteres (dados fictícios).' });
        const session = await mock.client.login(body.login, body.password);
        const token = randomUUID(); sessions.set(token, session.userId);
        return json(res, 200, { ...session, token });
      }
      if (path === '/index.php') {
        const form = req.method === 'POST' ? new URLSearchParams(await bodyText(req)) : new URLSearchParams();
        const result = await legacy(req, url, form); return json(res, result.status, result.data);
      }
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const userId = token ? sessions.get(token) : undefined;
      if (!userId) return json(res, 401, { message: 'Sessão inválida. Entre no simulador.' });
      if (path === '/__sim/logs' && req.method === 'GET') return json(res, 200, { scenario, logs });
      if (path === '/__sim/scenario' && req.method === 'POST') {
        const body = await bodyJson(req);
        if (!['normal', 'latency', 'server-error', 'unauthorized', 'lost-response'].includes(body.scenario)) return json(res, 400, { message: 'Cenário inválido' });
        scenario = body.scenario; return json(res, 200, { scenario });
      }
      if (path === '/__sim/reset' && req.method === 'POST') { mock.reset(); fingerprints.clear(); scenario = 'normal'; return json(res, 200, { message: 'Pedidos e cenários restaurados. Sessão preservada.' }); }
      if (path === '/__sim/orders/transition' && req.method === 'POST') {
        const body = await bodyJson(req);
        if (!['accept', 'partial', 'reject', 'invoice'].includes(body.action) || typeof body.orderClientId !== 'string') return json(res, 400, { message: 'Ação inválida' });
        return mock.transition(body.orderClientId, body.action) ? json(res, 200, { message: 'Estado atualizado' }) : json(res, 404, { message: 'Pedido não encontrado' });
      }
      if (scenario === 'latency') await new Promise(resolve => setTimeout(resolve, 2500));
      if (scenario === 'unauthorized') return json(res, 401, { message: 'Sessão expirada (simulação)' });
      if (scenario === 'server-error') return json(res, 500, { message: 'Falha temporária (simulação)' });
      if (path === '/api/mobile/v1/bootstrap' && req.method === 'GET') {
        const { tracked, ...bootstrap } = fixtures;
        return json(res, 200, bootstrap);
      }
      if (path === '/api/mobile/v1/goals' && req.method === 'GET') return json(res, 200, await mock.client.getGoals());
      if (path === '/api/mobile/v1/orders' && req.method === 'GET') return json(res, 200, await mock.client.listOrders());
      if (path === '/api/mobile/v1/orders' && req.method === 'POST') {
        const body = await bodyJson(req);
        if (!validPayload(body) || body.id_usuario !== userId) return json(res, 400, { message: 'Payload inválido: confira usuário, cliente, tabela, produtos, distribuidores e datas.' });
        const key = req.headers['idempotency-key'];
        if (key !== body.order_client_id) return json(res, 400, { message: 'Idempotency-Key deve ser igual a order_client_id' });
        const response = await submit(body); return json(res, response.status, response.data);
      }
      return json(res, 404, { message: 'Endpoint não encontrado' });
    } catch (error) { return json(res, (error as { status?: number }).status ?? 500, { message: (error as Error).message }); }
  });
  return { server };
}
function json(res: ServerResponse, status: number, value: unknown) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
async function bodyText(req: IncomingMessage): Promise<string> {
  let size = 0; const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    req.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 256 * 1024) { reject(Object.assign(new Error('Payload excede 256 KiB'), { status: 413 })); return; } chunks.push(chunk); });
    req.on('end', resolve); req.on('error', reject);
  });
  return Buffer.concat(chunks).toString('utf8');
}
async function bodyJson(req: IncomingMessage): Promise<any> {
  const raw = await bodyText(req);
  try { const value = JSON.parse(raw); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}
function validPayload(body: any): body is SubmitOrderPayload {
  if (typeof body.order_client_id !== 'string' || body.order_client_id.length < 1 || body.order_client_id.length > 128 || !Number.isInteger(body.id_cliente) || !Number.isInteger(body.id_tabela) || !Number.isInteger(body.id_usuario) || typeof body.datahora_criacao !== 'string' || !Number.isFinite(Date.parse(body.datahora_criacao))) return false;
  if (!Array.isArray(body.array_produtos) || !body.array_produtos.length || body.array_produtos.length > 1000 || !body.array_produtos.every((p: any) => p && typeof p.ean === 'string' && Number.isInteger(p.quantidade) && p.quantidade > 0)) return false;
  if (new Set(body.array_produtos.map((p: any) => p.ean)).size !== body.array_produtos.length) return false;
  const customer = fixtures.customers.find(c => c.id === body.id_cliente);
  if (!customer || !Array.isArray(body.array_ordem_envio) || !body.array_ordem_envio.length || body.array_ordem_envio.length > 6 || !body.array_ordem_envio.every((d: any, i: number) => d && d.prioridade === i + 1 && customer.distributors.some(allowed => allowed.id === d.id_distribuidor && allowed.tipoEnvio === d.tipo_envio && allowed.prazos.includes(d.prazo)))) return false;
  if (new Set(body.array_ordem_envio.map((d: any) => d.id_distribuidor)).size !== body.array_ordem_envio.length) return false;
  if (body.array_agendamento !== undefined && (!Array.isArray(body.array_agendamento) || body.array_agendamento.length > 12 || !body.array_agendamento.every((d: any) => d && typeof d.data_envio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.data_envio) && Number.isFinite(Date.parse(d.data_envio))))) return false;
  return body.cupom === undefined || typeof body.cupom === 'string';
}
