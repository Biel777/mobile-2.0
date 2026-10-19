import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { apiConfig, type ApiConfig } from '@tradetools/config';
import { useAppStore } from '@data/store';
import { createAppStorage } from '@data/storage';
import { buildEndpoint, endpointFields, transportEndpoint, validateEndpoint, type EndpointFields } from './url';

const key = 'sales-endpoint-v1';
type ConnectionState = { ready: boolean; busy: boolean; config: ApiConfig; error?: string };
export const useConnection = create<ConnectionState>(() => ({ ready: false, busy: false, config: { ...apiConfig } }));

async function activate(config: ApiConfig, restoreSession = false) {
  const base = config.mode === 'http' && config.protocol === 'legacy'
    ? transportEndpoint(config.baseUrl, Platform.OS, __DEV__) : config.baseUrl;
  await useAppStore.configure(config, createAppStorage(AsyncStorage, SecureStore, Platform.OS, config), base, restoreSession);
  useConnection.setState({ config, ready: true, error: undefined });
}

let initialization: Promise<void> | undefined;
export function initializeConnection() {
  return initialization ??= (async () => {
    try {
      const saved = await AsyncStorage.getItem(key);
      const data = saved ? JSON.parse(saved) : apiConfig;
      if (!['http', 'mock'].includes(data.mode) || !['legacy', 'mobile-v1'].includes(data.protocol)) throw new Error('Configuração salva inválida.');
      const config = { ...apiConfig, mode: data.mode, protocol: data.protocol, baseUrl: data.baseUrl };
      if (config.mode === 'http' && config.protocol === 'legacy') config.baseUrl = validateEndpoint(config.baseUrl);
      await activate(config, true);
    } catch (error) {
      useConnection.setState({ ready: true, error: error instanceof Error ? error.message : 'Falha ao ler configuração.' });
      useAppStore.setState({ hydrated: true, session: null });
    }
  })();
}

export async function saveEndpoint(fields: EndpointFields, demonstration = false) {
  if (useConnection.getState().busy) throw new Error('Aguarde a troca de conexão.');
  const config: ApiConfig = { ...apiConfig, mode: demonstration ? 'mock' : 'http', protocol: 'legacy', baseUrl: buildEndpoint(fields) };
  const previous = useConnection.getState().config;
  useConnection.setState({ busy: true });
  try {
    if (previous.baseUrl !== config.baseUrl || previous.mode !== config.mode || previous.protocol !== config.protocol || !useAppStore.getState().hydrated || useConnection.getState().error) await activate(config);
    await AsyncStorage.setItem(key, JSON.stringify({ mode: config.mode, protocol: config.protocol, baseUrl: config.baseUrl }));
    useConnection.setState({ config, error: undefined });
  } finally { useConnection.setState({ busy: false }); }
}

export function configuredFields(): EndpointFields {
  try { return endpointFields(useConnection.getState().config.baseUrl); }
  catch { return { scheme: 'http', host: '10.11.0.11', industry: '' }; }
}

export async function testEndpoint(fields: EndpointFields) {
  const base = transportEndpoint(buildEndpoint(fields), Platform.OS, __DEV__);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${base}/index.php?r=api/authentication/new`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: '', signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP: ${response.status}`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INCOMPLETE_CONTRACT: objeto JSON esperado.');
    return 'Endpoint respondeu JSON. A autenticação ainda precisa ser validada com seu login.';
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('INCOMPLETE_CONTRACT: resposta não é JSON.');
    if (controller.signal.aborted) throw new Error('TIMEOUT: tempo de conexão esgotado.');
    if (error instanceof TypeError) throw new Error('NETWORK: não foi possível alcançar o endpoint.');
    throw error;
  } finally { clearTimeout(timer); }
}
