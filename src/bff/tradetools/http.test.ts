import { describe, expect, it, vi } from 'vitest';
import { fixtures } from '@data/fixtures';
import type { SubmitOrderPayload } from '@rules/types';
import { createHttpClient } from './http';

const baseUrl = 'http://localhost:4010/';
const session = { token: 'session-test', userId: fixtures.user.id, name: fixtures.user.name };
const bootstrap = { user: fixtures.user, customers: fixtures.customers, tables: fixtures.tables,
  coupons: fixtures.coupons, goals: fixtures.goals, flags: fixtures.flags };
const payload: SubmitOrderPayload = {
  order_client_id: 'device-stable-id', id_cliente: 11, id_tabela: 101, id_usuario: 77,
  datahora_criacao: '2026-10-16T12:00:00Z',
  array_ordem_envio: [{ id_distribuidor: 501, prioridade: 1, tipo_envio: 2, prazo: 28 }],
  array_produtos: [{ ean: '78910001', quantidade: 30 }],
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

describe('adaptador HTTP Sales API', () => {
  it('autentica e carrega bootstrap usando bearer, sem credenciais nas URLs', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(session)).mockResolvedValueOnce(json(bootstrap));
    const client = createHttpClient({ baseUrl, fetchImpl });
    expect(await client.login('marina', 'demo123')).toEqual(session);
    expect(await client.getBootstrap()).toEqual(bootstrap);
    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost:4010/api/mobile/v1/auth/login');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ login: 'marina', password: 'demo123' }) });
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ headers: { Authorization: 'Bearer session-test' } });
  });

  it('reenvia pedido com a mesma chave após resposta perdida e consulta os retornos', async () => {
    const result = { id_pedido_gerado: 9000, id_status: 4, erros_envio: [] };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ message: 'Resposta perdida' }, 503))
      .mockResolvedValueOnce(json(result)).mockResolvedValueOnce(json(fixtures.tracked)).mockResolvedValueOnce(json(fixtures.goals));
    const client = createHttpClient({ baseUrl, getToken: () => session.token, fetchImpl });
    await expect(client.submitOrder(payload)).rejects.toMatchObject({ code: 'HTTP', status: 503 });
    expect(await client.submitOrder(payload)).toEqual(result);
    for (const call of fetchImpl.mock.calls.slice(0, 2)) {
      expect(call[1]).toMatchObject({ headers: { 'Idempotency-Key': payload.order_client_id }, body: JSON.stringify(payload) });
    }
    expect(await client.listOrders()).toEqual(fixtures.tracked);
    expect(await client.getGoals()).toEqual(fixtures.goals);
  });

  it('respeita token atual da sessão e bloqueia acesso sem autenticação', async () => {
    let token: string | undefined = 'first';
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(fixtures.goals));
    const client = createHttpClient({ baseUrl, getToken: () => token, fetchImpl });
    await client.getGoals();
    token = 'second';
    await client.getGoals();
    expect(fetchImpl.mock.calls[1][1]).toMatchObject({ headers: { Authorization: 'Bearer second' } });
    token = undefined;
    await expect(client.getGoals()).rejects.toMatchObject({ code: 'AUTH', status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('informa sessão expirada, erro HTTP não JSON e falha de rede', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }))
      .mockRejectedValueOnce(new Error('fetch failed'));
    const client = createHttpClient({ baseUrl, getToken: () => session.token, fetchImpl });
    await expect(client.getGoals()).rejects.toMatchObject({ code: 'AUTH', status: 401 });
    await expect(client.getGoals()).rejects.toMatchObject({ code: 'HTTP', status: 502 });
    await expect(client.getGoals()).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('rejeita JSON malformado e estruturas incompatíveis antes de chegar às telas', async () => {
    const malformed = { ...bootstrap, tables: [{ ...fixtures.tables[0], products: [{}] }] };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('not-json'))
      .mockResolvedValueOnce(json(malformed)).mockResolvedValueOnce(json({ token: '', userId: 77, name: 'Marina' }))
      .mockResolvedValueOnce(json([{ id: 1 }])).mockResolvedValueOnce(json({ id_pedido_gerado: 4 }));
    const client = createHttpClient({ baseUrl, getToken: () => session.token, fetchImpl });
    await expect(client.getGoals()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(client.getBootstrap()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(client.login('marina', 'demo')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(client.listOrders()).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    await expect(client.submitOrder(payload)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('aborta uma conexão que excede o tempo limite', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const client = createHttpClient({ baseUrl, getToken: () => session.token, timeoutMs: 10, fetchImpl });
    await expect(client.getGoals()).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it('não reconhece como enviado um pedido sem ID remoto ou ainda em digitação', async () => {
    const invalidResults = [
      { id_pedido_gerado: 0, id_status: 7, erros_envio: [] },
      { id_pedido_gerado: 0, id_status: 4, erros_envio: [] },
      { id_pedido_gerado: 9000, id_status: 7, erros_envio: [] },
      { id_pedido_gerado: 9000.5, id_status: 4, erros_envio: [] },
      { id_pedido_gerado: 9000, id_status: 999, erros_envio: [] },
    ];
    const fetchImpl = vi.fn<typeof fetch>();
    for (const result of invalidResults) fetchImpl.mockResolvedValueOnce(json(result));
    const rejected = { id_pedido_gerado: 0, id_status: 7, erros_envio: ['Mínimo não atingido'] };
    const replay = { id_pedido_gerado: 9000, id_status: 1, erros_envio: [] };
    fetchImpl.mockResolvedValueOnce(json(rejected)).mockResolvedValueOnce(json(replay));
    const client = createHttpClient({ baseUrl, getToken: () => session.token, fetchImpl });
    for (let index = 0; index < invalidResults.length; index++) {
      await expect(client.submitOrder(payload)).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
    expect(await client.submitOrder(payload)).toEqual(rejected);
    expect(await client.submitOrder(payload)).toEqual(replay);
  });

  it('rejeita configuração e identificador de pedido inválidos', async () => {
    expect(() => createHttpClient({ baseUrl: '' })).toThrow(/EXPO_PUBLIC_API_URL/);
    expect(() => createHttpClient({ baseUrl, timeoutMs: 0 })).toThrow(/Timeout/);
    const fetchImpl = vi.fn<typeof fetch>();
    await expect(createHttpClient({ baseUrl, fetchImpl }).submitOrder({ ...payload, order_client_id: '' }))
      .rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
