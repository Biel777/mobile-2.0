import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { apiConfig } from '../api/config';

// Web tokens live only in memory; native tokens use the encrypted device store.
const tokenKey = `sales-token-${apiConfig.mode}-${apiConfig.protocol}-${encodeURIComponent(apiConfig.baseUrl).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
let writes = Promise.resolve();
function serialize(operation: () => Promise<void>) {
  const task = writes.then(operation);
  writes = task.catch(() => {});
  return task;
}
export const appStorage = {
  async getItem(key: string) {
    await writes;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data.state?.session) {
      data.state.session.token = Platform.OS === 'web' ? '' : (await SecureStore.getItemAsync(tokenKey)) ?? '';
    }
    return JSON.stringify(data);
  },
  setItem(key: string, raw: string) {
    return serialize(async () => {
      const data = JSON.parse(raw);
      const token = data.state?.session?.token;
      if (Platform.OS !== 'web') {
        if (token) await SecureStore.setItemAsync(tokenKey, token);
        else await SecureStore.deleteItemAsync(tokenKey);
      }
      if (data.state?.session) data.state.session.token = '';
      await AsyncStorage.setItem(key, JSON.stringify(data));
    });
  },
  removeItem(key: string) {
    return serialize(async () => {
      if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(tokenKey);
      await AsyncStorage.removeItem(key);
    });
  },
};
