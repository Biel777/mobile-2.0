import { describe, expect, it, vi } from 'vitest';
vi.mock('./storage', () => ({ appStorage: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} } }));
import { createAppStore } from './store';
import { fixtures } from './fixtures';
import type { SalesApiClient } from '../api/client';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function setup() {
  const values = new Map<string, string>();
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); }, removeItem: async (key: string) => { values.delete(key); } };
  const { tracked, ...catalog } = structuredClone(fixtures);
  const client: SalesApiClient = {
    login: vi.fn(async () => ({ token: 'token', userId: catalog.user.id, name: catalog.user.name })),
    getBootstrap: vi.fn(async () => catalog), listOrders: vi.fn(async () => tracked), getGoals: vi.fn(async () => catalog.goals),
    submitOrder: vi.fn(async () => ({ id_pedido_gerado: 0, id_status: 7, erros_envio: [] })),
  };
  return { storage, client, catalog, store: createAppStore(storage, client) };
}
describe('persistência da agenda por conta', () => {
  it('evita duplicidade por loja/dia, mantém dias independentes e persiste conclusão', async () => {
    const { store, client, storage } = setup(); await store.getState().login('marina', 'demo');
    store.getState().addVisit(11, '2026-10-17'); store.getState().addVisit(11, '2026-10-17'); store.getState().addVisit(11, '2026-10-18');
    expect(store.getState().visits).toHaveLength(2);
    store.getState().setVisitCompleted(11, '2026-10-17', true);
    const completedAt = store.getState().visits[0].completedAt;
    store.getState().setVisitCompleted(11, '2026-10-17', true);
    expect(store.getState().visits[0].completedAt).toBe(completedAt); await tick();
    const restored = createAppStore(storage, client); await tick(); expect(restored.getState().visits).toEqual(store.getState().visits);
    restored.getState().setVisitCompleted(11, '2026-10-17', false); expect(restored.getState().visits[0].completedAt).toBeUndefined();
    restored.getState().removeVisit(11, '2026-10-17'); expect(restored.getState().visits.map(visit => visit.date)).toEqual(['2026-10-18']);
  });
  it('exige sessão, loja conhecida e data válida; conclusão exige agendamento', async () => {
    const { store } = setup(); expect(() => store.getState().addVisit(11, '2026-10-17')).toThrow(); await store.getState().login('marina', 'demo');
    expect(() => store.getState().addVisit(99999, '2026-10-17')).toThrow(); expect(() => store.getState().addVisit(11, '2026-02-30')).toThrow();
    expect(() => store.getState().setVisitCompleted(11, '2026-10-17', true)).toThrow();
  });
  it('preserva agenda na mesma conta e limpa ao trocar de usuário', async () => {
    const { store, client, catalog } = setup(); await store.getState().login('marina', 'demo'); store.getState().addVisit(11, '2026-10-17');
    store.getState().logout(); await store.getState().login('marina', 'demo'); expect(store.getState().visits).toHaveLength(1);
    store.getState().logout(); catalog.user.id = 999;
    vi.mocked(client.login).mockResolvedValue({ token: 'other', userId: 999, name: 'Outro' });
    await store.getState().login('other', 'demo'); expect(store.getState().visits).toEqual([]);
  });
  it('permite remover visita cuja loja saiu da carteira após sincronizar', async () => {
    const { store } = setup(); await store.getState().login('marina', 'demo'); store.getState().addVisit(11, '2026-10-17');
    const catalog = structuredClone(store.getState().catalog);
    catalog.customers = catalog.customers.filter(customer => customer.id !== 11);
    catalog.goals.pdvsSemPositivar = catalog.goals.pdvsSemPositivar.filter(customer => customer.id !== 11);
    catalog.goals.families = catalog.goals.families.map(family => ({ ...family, semPositivar: family.semPositivar.filter(customer => customer.id !== 11) }));
    store.setState({ catalog });
    expect(() => store.getState().addVisit(11, '2026-10-18')).toThrow();
    store.getState().removeVisit(11, '2026-10-17'); expect(store.getState().visits).toEqual([]);
  });
  it('carrega persistência anterior sem visitas preservando rascunhos', async () => {
    const { store, storage, client } = setup(); await store.getState().login('marina', 'demo'); const id = store.getState().createDraft(11, 101); await tick();
    const name = store.persist.getOptions().name!; const saved = JSON.parse((await storage.getItem(name))!); delete saved.state.visits; await storage.setItem(name, JSON.stringify(saved));
    const restored = createAppStore(storage, client); await tick(); expect(restored.getState().visits).toEqual([]); expect(restored.getState().orders.some(order => order.id === id)).toBe(true);
  });
});
