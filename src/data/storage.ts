import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiConfig } from '@tradetools/config';

type CacheStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
};
type Tokens = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

// Endpoint changes create new adapters over the same device storage. Reads must
// await pending writes from the previous adapter before restoring its drafts.
const pendingWrites = new WeakMap<CacheStorage, Promise<void>>();

/** Preserve account data when only the transport namespace or area field changed. */
export function createAppStorage(
  cache: CacheStorage,
  tokens: Tokens,
  platform: string,
  config = apiConfig,
) {
  const tokenKey = `sales-token-${config.mode}-${config.protocol}-${encodeURIComponent(config.baseUrl).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const prefix = `forca-vendas-v5-${config.mode}-`;
  const suffix = `-${config.baseUrl}`;
  const currentKey = `${prefix}${config.protocol}${suffix}`;
  function serialize(operation: () => Promise<void>) {
    const task = (pendingWrites.get(cache) ?? Promise.resolve()).then(operation);
    pendingWrites.set(
      cache,
      task.catch(() => {}),
    );
    return task;
  }
  return {
    async getItem(key: string) {
      await pendingWrites.get(cache);
      let raw = await cache.getItem(key);
      let recovered = false;
      if (!raw && key === currentKey && config.protocol === 'legacy') {
        const candidates = (await cache.getAllKeys()).filter(
          (candidate) =>
            candidate !== key &&
            !candidate.startsWith(`${prefix}mobile-v1-`) &&
            candidate.startsWith(prefix) &&
            candidate.endsWith(suffix) &&
            candidate.length > prefix.length + suffix.length,
        );
        // Do not choose between multiple transport histories or cross tenant/account boundaries.
        if (candidates.length === 1) {
          raw = await cache.getItem(candidates[0]);
          recovered = !!raw;
        }
      }
      if (!raw) return null;
      const data = JSON.parse(raw);
      const customers = data.state?.catalog?.customers;
      if (Array.isArray(customers)) {
        for (const customer of customers) {
          if (
            !customer ||
            typeof customer !== 'object' ||
            typeof customer.hasSalesArea === 'boolean'
          )
            continue;
          const previous = Object.entries(customer).filter(
            ([field, value]) => /^has.+Area$/.test(field) && typeof value === 'boolean',
          );
          if (previous.length === 1) customer.hasSalesArea = previous[0][1];
        }
      }
      // A recovered namespace never guesses a previous secure token key.
      if (data.state?.session)
        data.state.session.token =
          platform === 'web' || recovered ? '' : ((await tokens.getItemAsync(tokenKey)) ?? '');
      return JSON.stringify(data);
    },
    setItem(key: string, raw: string) {
      return serialize(async () => {
        const data = JSON.parse(raw);
        const token = data.state?.session?.token;
        if (platform !== 'web') {
          if (token) await tokens.setItemAsync(tokenKey, token);
          else await tokens.deleteItemAsync(tokenKey);
        }
        if (data.state?.session) data.state.session.token = '';
        await cache.setItem(key, JSON.stringify(data));
      });
    },
    removeItem(key: string) {
      return serialize(async () => {
        if (platform !== 'web') await tokens.deleteItemAsync(tokenKey);
        await cache.removeItem(key);
      });
    },
  };
}

// Web tokens live only in memory; native tokens use the encrypted device store.
export const appStorage = createAppStorage(AsyncStorage, SecureStore, Platform.OS);
