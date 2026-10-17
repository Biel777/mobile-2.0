import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./storage', () => ({ appStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
import { createAppStore } from './store';
import { apiConfig } from '../api/config';
afterEach(() => { apiConfig.protocol = 'mobile-v1'; });
import { fixtures } from './fixtures';
import type { SalesApiClient } from '../api/client';

const memory = () => {
  const values = new Map<string, string>();
  return { getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
    removeItem: async (key: string) => { values.delete(key); } };
};
function setup() {
  const { tracked, ...bootstrap } = fixtures;
  const client: SalesApiClient = {
    login: vi.fn(async () => ({ token: 'test-token', userId: fixtures.user.id, name: fixtures.user.name })),
    getBootstrap: vi.fn(async () => structuredClone(bootstrap)),
    listOrders: vi.fn(async () => structuredClone(tracked)),
    getGoals: vi.fn(async () => fixtures.goals),
    submitOrder: vi.fn(async () => ({ id_pedido_gerado: 9999, id_status: 4, erros_envio: [] })),
  };
  const store = createAppStore(memory(), client);
  return { store, client };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

describe('integração da carteira e fila', () => {

  it('não repete Legacy incerto automaticamente; exige confirmação explícita', async () => {
    apiConfig.protocol = 'legacy';
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    const id = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 } });
    store.getState().enqueue(id);
    vi.mocked(client.submitOrder).mockRejectedValueOnce(new Error('Confirmação perdida'));
    store.getState().setOnline(true);
    await tick();
    store.getState().setOnline(false);
    store.getState().setOnline(true);
    await store.getState().flush();
    expect(client.submitOrder).toHaveBeenCalledTimes(1);
    store.getState().retryUncertain(id);
    await tick();
    expect(client.submitOrder).toHaveBeenCalledTimes(2);
    expect(store.getState().orders[0].queueStatus).toBe('sent');
  });

  it('reconcilia ID remoto confirmado sem refazer o POST Legacy', async () => {
    apiConfig.protocol = 'legacy';
    const { store, client } = setup();
    client.getOrderStatus = vi.fn().mockRejectedValueOnce(new Error('Status ainda indisponível'))
      .mockResolvedValue({ id_pedido_gerado: 777, id_status: 4, erros_envio: [] });
    await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    const id = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 } });
    store.getState().enqueue(id);
    vi.mocked(client.submitOrder).mockRejectedValueOnce(Object.assign(new Error('Status pendente'), { code: 'STATUS_PENDING', remoteId: 777 }));
    store.getState().setOnline(true);
    await tick();
    expect(store.getState().orders[0].remoteId).toBe(777);
    await store.getState().refreshTracked();
    await store.getState().flush();
    expect(client.submitOrder).toHaveBeenCalledTimes(1);
    expect(store.getState().orders[0].queueStatus).toBe('sent');
    expect(store.getState().orders[0].deliveryUncertain).toBe(false);
  });

  it('recusa comercial confirmada fica editável e alteração exige nova confirmação de envio', async () => {
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    const id = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 } });
    store.getState().enqueue(id);
    vi.mocked(client.submitOrder).mockResolvedValueOnce({ id_pedido_gerado: 0, id_status: 7, erros_envio: ['Mínimo não atingido'] });
    store.getState().setOnline(true);
    await tick();
    expect(store.getState().orders[0].deliveryUncertain).toBe(false);
    store.getState().updateDraft(id, { lines: [{ ean: '78910001', quantity: 120 }] });
    expect(store.getState().orders[0].queueStatus).toBeUndefined();
    expect(store.getState().orders[0].lines[0].quantity).toBe(120);
  });

  it('persiste código da sessão renovada antes de sincronizar Legacy', async () => {
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    client.refreshSession = vi.fn(async () => ({ ...store.getState().session!, login: 'marina', codigoSincronizacao: '222' }));
    await store.getState().pullUpdates();
    expect(store.getState().session?.codigoSincronizacao).toBe('222');
    expect(client.refreshSession).toHaveBeenCalledTimes(1);
  });


  it('interrompe o lote quando a sessão muda durante o primeiro envio', async () => {
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    for (let n = 0; n < 2; n++) {
      const id = store.getState().createDraft(11, 101);
      store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 } });
      store.getState().enqueue(id);
    }
    let done!: (value: Awaited<ReturnType<SalesApiClient['submitOrder']>>) => void;
    vi.mocked(client.submitOrder).mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    store.getState().setOnline(true);
    await tick();
    store.getState().logout();
    await store.getState().login('marina', 'demo');
    done({ id_pedido_gerado: 9999, id_status: 4, erros_envio: [] });
    await tick();
    expect(client.submitOrder).toHaveBeenCalledTimes(1);
  });

  it('bloqueia edição de envio incerto e preserva o payload original no retry', async () => {
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    const id = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 }, lines: [{ ean: '78910001', quantity: 120 }] });
    store.getState().enqueue(id);
    vi.mocked(client.submitOrder).mockRejectedValueOnce(new Error('Confirmação perdida'));
    store.getState().setOnline(true);
    await tick();
    expect(store.getState().orders[0].deliveryUncertain).toBe(true);
    store.getState().updateDraft(id, { lines: [] });
    expect(store.getState().orders[0].lines).toHaveLength(1);
    const original = vi.mocked(client.submitOrder).mock.calls[0][0];
    await store.getState().flush();
    expect(vi.mocked(client.submitOrder).mock.calls[1][0]).toEqual(original);
  });

  it('401 no envio exige reautenticação mesmo quando a consulta seria bem sucedida', async () => {
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    const id = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 } });
    store.getState().enqueue(id);
    vi.mocked(client.submitOrder).mockRejectedValueOnce(Object.assign(new Error('Sessão expirada'), { status: 401 }));
    store.getState().setOnline(true);
    await tick();
    expect(store.getState().authRequired).toBe(true);
    expect(store.getState().orders[0].queueStatus).toBe('failed');
  });

  it('usa bootstrap da API em vez de manter fixtures na interface', async () => {
    const { store, client } = setup();
    const { tracked, ...catalog } = fixtures;
    catalog.user = { ...catalog.user, name: 'Representante da API' };
    vi.mocked(client.getBootstrap).mockResolvedValue(catalog);
    await store.getState().login('user', 'password');
    expect(store.getState().catalog.user.name).toBe('Representante da API');
    expect(client.getBootstrap).toHaveBeenCalledTimes(1);
    expect(store.getState().tracked).toEqual(tracked);
  });

  it('serializa envios e preserva rascunho criado durante chamada', async () => {
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    const id = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 }, lines: [{ ean: '78910001', quantity: 120 }] });
    store.getState().enqueue(id);
    expect(client.submitOrder).not.toHaveBeenCalled();
    let done!: (value: Awaited<ReturnType<SalesApiClient['submitOrder']>>) => void;
    vi.mocked(client.submitOrder).mockImplementation(() => new Promise(resolve => { done = resolve; }));
    store.getState().setOnline(true);
    await tick();
    await store.getState().flush();
    const second = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { lines: [] });
    done({ id_pedido_gerado: 9999, id_status: 4, erros_envio: [] });
    await tick();
    expect(client.submitOrder).toHaveBeenCalledTimes(1);
    expect(store.getState().orders.find(order => order.id === id)?.queueStatus).toBe('sent');
    expect(store.getState().orders.find(order => order.id === id)?.lines).toHaveLength(1);
    expect(store.getState().orders.some(order => order.id === second)).toBe(true);
  });

  it('falha HTTP mantém pedido editável e retry usa a mesma chave', async () => {
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    const id = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 } });
    store.getState().enqueue(id);
    vi.mocked(client.submitOrder).mockRejectedValueOnce(new Error('Servidor indisponível'));
    store.getState().setOnline(true);
    await tick();
    expect(store.getState().orders[0].queueStatus).toBe('failed');
    expect(store.getState().syncError).toMatch(/indisponível/);
    await store.getState().flush();
    expect(store.getState().orders[0].queueStatus).toBe('sent');
    const calls = vi.mocked(client.submitOrder).mock.calls;
    expect(calls[0][0].order_client_id).toBe(calls[1][0].order_client_id);
  });

  it('logout ignora retorno de request antigo e login de outro usuário limpa carteira e fila', async () => {
    const { store, client } = setup();
    await store.getState().login('marina', 'demo');
    store.getState().createDraft(11, 101);
    let complete!: (orders: typeof fixtures.tracked) => void;
    vi.mocked(client.listOrders).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const request = store.getState().refreshTracked();
    store.getState().logout();
    complete([]);
    await request;
    expect(store.getState().tracked.length).toBeGreaterThan(0);
    expect(store.getState().session).toBeNull();
    vi.mocked(client.login).mockResolvedValueOnce({ token: 'other-token', userId: 88, name: 'Outro' });
    const { tracked, ...catalog } = structuredClone(fixtures);
    catalog.user.id = 88;
    vi.mocked(client.getBootstrap).mockResolvedValueOnce(catalog);
    await store.getState().login('outro', 'demo');
    expect(store.getState().ownerId).toBe(88);
    expect(store.getState().orders).toEqual([]);
  });

  it('não inventa aceite de pedido ao atualizar', async () => {
    const { store } = setup();
    await store.getState().login('marina', 'demo');
    const before = structuredClone(store.getState().tracked);
    await store.getState().pullUpdates();
    expect(store.getState().tracked).toEqual(before);
    expect(store.getState().notices).toEqual([]);
  });
});
