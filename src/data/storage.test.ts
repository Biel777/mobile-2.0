import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  raw: new Map<string, string>(), secure: new Map<string, string>(), platform: { OS: 'web' },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => mocks.raw.get(key) ?? null,
  setItem: async (key: string, value: string) => { mocks.raw.set(key, value); },
  removeItem: async (key: string) => { mocks.raw.delete(key); },
} }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => mocks.secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { mocks.secure.set(key, value); },
  deleteItemAsync: async (key: string) => { mocks.secure.delete(key); },
}));
import { appStorage } from './storage';
const sample = (token: string) => JSON.stringify({ state: { session: { token, userId: 77, name: 'Demo' }, orders: [{ id: 'draft-1' }] }, version: 0 });

beforeEach(() => { mocks.raw.clear(); mocks.secure.clear(); mocks.platform.OS = 'web'; });
describe('persistência de credenciais', () => {
  it('não grava token no cache web e mantém os rascunhos', async () => {
    await appStorage.setItem('test', sample('secret-web-token'));
    expect(mocks.raw.get('test')).not.toContain('secret-web-token');
    expect(mocks.secure.size).toBe(0);
    const restored = JSON.parse((await appStorage.getItem('test'))!);
    expect(restored.state.session.token).toBe('');
    expect(restored.state.orders[0].id).toBe('draft-1');
  });
  it('separa token nativo e o remove ao sair', async () => {
    mocks.platform.OS = 'android';
    await appStorage.setItem('test', sample('secret-native-token'));
    expect(mocks.raw.get('test')).not.toContain('secret-native-token');
    expect([...mocks.secure.values()]).toEqual(['secret-native-token']);
    expect(JSON.parse((await appStorage.getItem('test'))!).state.session.token).toBe('secret-native-token');
    await appStorage.setItem('test', JSON.stringify({ state: { session: null, orders: [] }, version: 0 }));
    expect(mocks.secure.size).toBe(0);
  });
  it('mantém ordem de gravações concorrentes de sessão e logout', async () => {
    mocks.platform.OS = 'ios';
    await Promise.all([appStorage.setItem('test', sample('first-token')),
      appStorage.setItem('test', JSON.stringify({ state: { session: null }, version: 0 }))]);
    expect(JSON.parse(mocks.raw.get('test')!).state.session).toBeNull();
    expect(mocks.secure.size).toBe(0);
  });
});
