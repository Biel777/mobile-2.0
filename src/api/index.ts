import { apiConfig, type ApiConfig } from './config';
import { createHttpClient, type HttpClientOptions } from './http';
import { mockClient } from './mock';
import { createLegacyClient, type LegacyClientOptions } from './legacy';

export { apiConfig } from './config';
export { createHttpClient, SalesApiError } from './http';
export { createLegacyClient } from './legacy';
export type { BootstrapData, Session, SalesApiClient } from './client';

export function createSalesApiClient(options: Partial<ApiConfig> & Omit<Partial<HttpClientOptions & LegacyClientOptions>, 'baseUrl'> = {}) {
  const config = { ...apiConfig, ...options };
  if (config.mode === 'mock') return mockClient;
  if (config.mode !== 'http') throw new Error('Modo de integração inválido.');
  if (config.protocol === 'legacy') return createLegacyClient(config);
  return createHttpClient(config);
}
