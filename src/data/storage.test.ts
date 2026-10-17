import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));
vi.mock('expo-secure-store', () => ({ getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }));
import { createAppStorage } from './storage';
import type { ApiConfig } from '../api/config';
const config: ApiConfig = { mode: 'http', protocol: 'legacy', baseUrl: 'https://tenant.example/app', imei: 'test', appVersion: '1', schedulePeriod: '08:00', timeZone: 'America/Sao_Paulo' };
const key = `forca-vendas-v5-${config.mode}-${config.protocol}-${config.baseUrl}`;
let values: Map<string, string>;
beforeEach(() => { values = new Map(); });
function setup(platform = 'web') {
  const cache = { getItem: vi.fn(async (name: string) => values.get(name) ?? null), setItem: vi.fn(async (name: string, value: string) => { values.set(name, value); }), removeItem: vi.fn(async (name: string) => { values.delete(name); }), getAllKeys: vi.fn(async () => [...values.keys()]) };
  const tokens = { getItemAsync: vi.fn(async () => 'secure-current-token'), setItemAsync: vi.fn(async () => {}), deleteItemAsync: vi.fn(async () => {}) };
  return { cache, tokens, storage: createAppStorage(cache, tokens, platform, config) };
}
const snapshot = () => ({ state: { ownerId: 77, session: { userId: 77, token: 'plaintext-must-not-survive' }, catalog: { customers: [{ id: 11, hasPreviousArea: false, areaId: 0 }, { id: 22, hasPreviousArea: true, areaId: 7 }] }, orders: [{ id: 'draft-1', userId: 77 }], tracked: [{ id: 100 }], orderUpdates: [{ key: 'client:draft-1' }], visits: [{ customerId: 22, date: '2026-10-17' }] }, version: 0 });
describe('recuperação conservadora do cache', () => {
  it('recupera namespace único do mesmo tenant/mode sem apagar histórico e exige autenticação', async () => {
    const oldKey = `forca-vendas-v5-http-previous-${config.baseUrl}`;
    const original = snapshot(); values.set(oldKey, JSON.stringify(original)); const { storage, cache, tokens } = setup('ios');
    const restored = JSON.parse((await storage.getItem(key))!);
    expect(restored.state.session.token).toBe(''); expect(tokens.getItemAsync).not.toHaveBeenCalled();
    expect(restored.state.ownerId).toBe(77); expect(restored.state.orders).toEqual(original.state.orders); expect(restored.state.tracked).toEqual(original.state.tracked); expect(restored.state.orderUpdates).toEqual(original.state.orderUpdates); expect(restored.state.visits).toEqual(original.state.visits);
    expect(restored.state.catalog.customers.map((customer: any) => customer.hasSalesArea)).toEqual([false, true]);
    expect(values.get(oldKey)).toBe(JSON.stringify(original)); expect(cache.removeItem).not.toHaveBeenCalled(); expect(cache.setItem).not.toHaveBeenCalled();
  });
  it('não escolhe cache ambíguo nem muda de ambiente/tenant', async () => {
    values.set(`forca-vendas-v5-http-previous-${config.baseUrl}`, JSON.stringify(snapshot()));
    values.set(`forca-vendas-v5-http-another-${config.baseUrl}`, JSON.stringify(snapshot()));
    expect(await setup().storage.getItem(key)).toBeNull();
    values.clear(); values.set('forca-vendas-v5-http-previous-https://other.example/app', JSON.stringify(snapshot()));
    values.set(`forca-vendas-v5-mock-previous-${config.baseUrl}`, JSON.stringify(snapshot()));
    expect(await setup().storage.getItem(key)).toBeNull();
  });
  it('prefere cache atual e normaliza campo antigo sem sobrescrever vínculo atual ou inferir ambíguos', async () => {
    const data = snapshot(); data.state.catalog.customers.push({ id: 33, hasPreviousArea: true, hasSalesArea: false, areaId: 0 } as any, { id: 44, hasPreviousArea: true, hasOtherArea: false, areaId: 7 } as any);
    values.set(key, JSON.stringify(data)); values.set(`forca-vendas-v5-http-previous-${config.baseUrl}`, JSON.stringify(snapshot()));
    const { storage, cache, tokens } = setup('android'); const restored = JSON.parse((await storage.getItem(key))!);
    expect(cache.getAllKeys).not.toHaveBeenCalled(); expect(tokens.getItemAsync).toHaveBeenCalledOnce(); expect(restored.state.session.token).toBe('secure-current-token');
    expect(restored.state.catalog.customers[2].hasSalesArea).toBe(false); expect(restored.state.catalog.customers[3].hasSalesArea).toBeUndefined();
  });
  it('remove token do cache web e mantém gravações serializadas', async () => {
    const { storage, tokens } = setup(); await storage.setItem(key, JSON.stringify(snapshot()));
    expect(JSON.parse(values.get(key)!).state.session.token).toBe(''); expect(tokens.setItemAsync).not.toHaveBeenCalled();
    expect(JSON.parse((await storage.getItem(key))!).state.session.token).toBe('');
  });
});

describe('segurança do token nativo e ordem das gravações', () => {
  it('grava o token somente no cofre nativo e o remove no logout', async () => {
    const { storage, tokens } = setup('android');
    await storage.setItem(key, JSON.stringify(snapshot()));
    expect(tokens.setItemAsync).toHaveBeenCalledWith(expect.any(String), 'plaintext-must-not-survive');
    expect(values.get(key)).not.toContain('plaintext-must-not-survive');
    await storage.setItem(key, JSON.stringify({ state: { session: null, orders: [{ id: 'draft-1' }] } }));
    expect(tokens.deleteItemAsync).toHaveBeenCalledOnce();
    expect(JSON.parse(values.get(key)!).state.orders[0].id).toBe('draft-1');
  });
  it('serializa sessão e logout concorrentes, deixando o logout por último', async () => {
    const { storage, tokens } = setup('ios');
    await Promise.all([storage.setItem(key, JSON.stringify(snapshot())), storage.setItem(key, JSON.stringify({ state: { session: null } }))]);
    expect(JSON.parse(values.get(key)!).state.session).toBeNull();
    expect(tokens.setItemAsync.mock.invocationCallOrder[0]).toBeLessThan(tokens.deleteItemAsync.mock.invocationCallOrder[0]);
  });
  it('não confunde o laboratório normalizado com um transporte anterior', async () => {
    values.set(`forca-vendas-v5-http-mobile-v1-${config.baseUrl}`, JSON.stringify(snapshot()));
    expect(await setup().storage.getItem(key)).toBeNull();
  });
});
