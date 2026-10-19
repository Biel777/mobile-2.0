export type ApiConfig = {
  mode: 'mock' | 'http'; baseUrl: string; protocol: 'mobile-v1' | 'legacy';
  imei: string; appVersion: string; userId?: number;
  schedulePeriod: string; timeZone: string;
};

// Expo requires direct process.env.EXPO_PUBLIC_* references for build-time replacement.
export const apiConfig: ApiConfig = {
  mode: readMode(process.env.EXPO_PUBLIC_API_MODE),
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'https://trade.fidelize.com.br/webol',
  protocol: readProtocol(process.env.EXPO_PUBLIC_API_PROTOCOL),
  imei: process.env.EXPO_PUBLIC_API_IMEI ?? 'mobile-app',
  appVersion: process.env.EXPO_PUBLIC_API_APP_VERSION ?? '0.1.0',
  userId: readUserId(process.env.EXPO_PUBLIC_API_USER_ID),
  schedulePeriod: process.env.EXPO_PUBLIC_API_SCHEDULE_PERIOD ?? '08:00',
  timeZone: process.env.EXPO_PUBLIC_API_TIMEZONE ?? 'America/Sao_Paulo',
};

function readMode(value: string | undefined): ApiConfig['mode'] {
  if (value === 'mock') return 'mock';
  if (!value) return 'http';
  if (value === 'http') return 'http';
  throw new Error('EXPO_PUBLIC_API_MODE deve ser mock ou http.');
}

function readProtocol(value: string | undefined): ApiConfig['protocol'] {
  if (value === 'mobile-v1') return 'mobile-v1';
  if (!value) return 'legacy';
  if (value === 'legacy') return 'legacy';
  throw new Error('EXPO_PUBLIC_API_PROTOCOL deve ser legacy ou mobile-v1.');
}

function readUserId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const id = Number(value);
  if (Number.isInteger(id) && id > 0) return id;
  throw new Error('EXPO_PUBLIC_API_USER_ID deve ser o ID numérico positivo do representante no tenant.');
}
