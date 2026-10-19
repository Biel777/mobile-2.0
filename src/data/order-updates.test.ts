import { describe, expect, it, vi } from 'vitest';
import { createAppStore } from './store';
import { fixtures } from './fixtures';
import { isAttention, isUnread } from '@rules/order-updates';
import type { SalesApiClient } from '@tradetools/client';
vi.mock('./storage', () => ({ appStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); } };
  const { tracked, ...bootstrap } = structuredClone(fixtures);
  const client: SalesApiClient = {
    login: vi.fn(async () => ({ token: 'token', userId: bootstrap.user.id, name: bootstrap.user.name })),
    getBootstrap: vi.fn(async () => bootstrap), listOrders: vi.fn(async () => tracked), getGoals: vi.fn(async () => bootstrap.goals),
    submitOrder: vi.fn(async () => ({ id_pedido_gerado: 0, id_status: 7, erros_envio: ['Mínimo não atingido'] })),
  };
  return { storage, client, bootstrap, store: createAppStore(storage, client) };
}
describe('persistência e isolamento da central', () => {
  it('mantém leitura distinta de revisão e preserva as duas ao recarregar', async () => {
    const { store, storage, client } = setup(); await store.getState().login('marina', 'demo');
    const update = store.getState().orderUpdates.find(isAttention)!; expect(update).toBeTruthy();
    store.getState().markOrderUpdateRead(update.key);
    expect(isAttention(store.getState().orderUpdates.find(item => item.key === update.key)!)).toBe(true);
    store.getState().reviewOrderUpdate(update.key); await tick();
    const restored = createAppStore(storage, client); await tick();
    const saved = restored.getState().orderUpdates.find(item => item.key === update.key)!;
    expect(isAttention(saved)).toBe(false); expect(isUnread(saved)).toBe(false);
  });
  it('não transfere histórico ou revisão para outra conta', async () => {
    const { store, client, bootstrap } = setup(); await store.getState().login('marina', 'demo');
    expect(store.getState().orderUpdates.length).toBeGreaterThan(0);
    store.getState().logout();
    bootstrap.user.id = 999;
    vi.mocked(client.login).mockResolvedValue({ token: 'other', userId: 999, name: 'Outro' });
    vi.mocked(client.listOrders).mockResolvedValue([]);
    await store.getState().login('outro', 'demo');
    expect(store.getState().orderUpdates).toEqual([]);
  });
  it('mostra falha do envio mesmo quando listagem remota também falha', async () => {
    const { store, client } = setup(); await store.getState().login('marina', 'demo');
    store.getState().setOnline(false);
    const id = store.getState().createDraft(11, 101);
    store.getState().updateDraft(id, { distributorIds: [501], prazos: { 501: 21 } });
    store.getState().enqueue(id);
    vi.mocked(client.listOrders).mockRejectedValue(new Error('Sem rede'));
    store.getState().setOnline(true); await tick();
    const update = store.getState().orderUpdates.find(item => item.localOrderId === id)!;
    expect(update.title).toBe('Falha no envio'); expect(isAttention(update)).toBe(true);
    expect(update.summary).toContain('Mínimo não atingido');
    store.getState().markAllOrderUpdatesRead();
    expect(isUnread(store.getState().orderUpdates.find(item => item.key === update.key)!)).toBe(true);
    expect(isAttention(store.getState().orderUpdates.find(item => item.key === update.key)!)).toBe(true);
  });
  it('reidrata persistência anterior sem orderUpdates sem perder rascunhos', async () => {
    const { store, storage, client } = setup(); await store.getState().login('marina', 'demo');
    const id = store.getState().createDraft(11, 101);
    await tick();
    const options = store.persist.getOptions(); const raw = await storage.getItem(options.name!);
    const saved = JSON.parse(raw!); delete saved.state.orderUpdates;
    await storage.setItem(options.name!, JSON.stringify(saved));
    const restored = createAppStore(storage, client); await tick();
    expect(restored.getState().orders.some(order => order.id === id)).toBe(true);
    expect(restored.getState().orderUpdates.length).toBeGreaterThan(0);
    expect(restored.getState().orderUpdates.filter(item => !item.attention).every(item => !isUnread(item))).toBe(true);
  });
});
