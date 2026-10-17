import type { BootstrapData, Session, SalesApiClient } from './client';
import type { Goals, SubmitOrderResult, TrackedOrder } from '../domain/types';

export class SalesApiError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = 'SalesApiError';
  }
}

export type HttpClientOptions = {
  /** Origem do gateway, ex.: http://localhost:4010. */
  baseUrl: string;
  getToken?: () => string | null | undefined;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type Check = (value: unknown) => boolean;
const str: Check = (v) => typeof v === 'string';
const text: Check = (v) => typeof v === 'string' && v.trim().length > 0;
const num: Check = (v) => typeof v === 'number' && Number.isFinite(v);
const bool: Check = (v) => typeof v === 'boolean';
const optional = (check: Check): Check => (v) => v === undefined || check(v);
const array = (check: Check): Check => (v) => Array.isArray(v) && v.every(check);
const object = (shape: Record<string, Check>): Check => (v) =>
  typeof v === 'object' && v !== null && !Array.isArray(v) &&
  Object.entries(shape).every(([key, check]) => check((v as Record<string, unknown>)[key]));
const choice = (...values: unknown[]): Check => (v) => values.includes(v);
const pdv = object({ id: num, name: str, city: str });
const goalsCheck = object({
  periodLabel: str, metaValor: num, realizadoValor: num, metaQtd: num, realizadoQtd: num,
  pdvsCarteira: num, pdvsPositivados: num, pdvsSemPositivar: array(pdv),
  families: array(object({ family: str, metaPdvs: num, faturados: num, semPositivar: array(pdv) })),
});
const bootstrapCheck = object({
  integrationWarnings: optional(array(str)),
  unsupportedFeatures: optional(array(choice('coupons', 'flags'))),
  user: object({ id: num, name: text, login: text, area: str, bloqueiaNegociado: bool }),
  customers: array(object({
    id: num, name: str, cnpj: str, city: str, areaId: num, hasSalesArea: bool, tableIds: array(num),
    distributors: array(object({ id: num, name: str, priority: num, tipoEnvio: choice(1, 2), prazos: array(num) })),
  })),
  tables: array(object({
    id: num, name: str, minValue: num, minValueBasis: choice('NET', 'GROSS'), expiresAt: str, onlyMobile: bool,
    comboParticipation: optional(num), monthBilledNet: optional(num), dividePedido: optional(bool),
    products: array(object({
      ean: text, name: str, family: optional(str), listPrice: num, baseDiscount: num, minQty: num,
      maxQty: optional(num), packSize: num, required: choice('none', 'basket', 'required'),
      isCombo: optional(bool), ceilingDiscount: optional(num), photoRestricted: optional(bool),
      tiers: array(object({ quantMin: num, percent: num })),
    })),
    triggers: array(object({ triggerEan: text, threshold: num, childEan: text, extraPercent: num })),
  })),
  coupons: array(object({ code: text, percent: num, minNet: num })),
  goals: goalsCheck,
  flags: array(object({ name: str, minNet: num, billedNet: num,
    families: array(object({ family: str, minNet: num, billedNet: num })),
  })),
});
const ordersCheck = array(object({
  id: num, orderClientId: text, customerName: str, tableName: str, status: num, prazo: num,
  dataEnvio: optional(str), createdAt: str,
  subOrders: array(object({
    id: num, distributorName: str, status: num, prazo: num,
    items: array(object({ ean: text, name: str, unitPrice: num, discountPercent: num,
      quantPed: num, quantEsp: num, quantNot: num, reason: optional(str) })),
    invoice: optional(object({ number: str, value: num, issuedAt: str })),
  })),
}));
const sessionCheck = object({ token: text, userId: num, name: text });
export const mobileContractChecks = { bootstrap: bootstrapCheck, goals: goalsCheck, orders: ordersCheck };
const submitShape = object({ id_pedido_gerado: num, id_status: num, erros_envio: array(text) });
const submittedStatuses = [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16];
const submitCheck: Check = (value) => {
  if (!submitShape(value)) return false;
  const result = value as SubmitOrderResult;
  if (!Number.isInteger(result.id_pedido_gerado) || result.id_pedido_gerado < 0) return false;
  // A rejection can have no remote ID; an acknowledged order must exist remotely.
  if (result.erros_envio.length > 0) return [...submittedStatuses, 7].includes(result.id_status);
  return result.id_pedido_gerado > 0 && submittedStatuses.includes(result.id_status);
};

export function createHttpClient(options: HttpClientOptions): SalesApiClient {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s/?#]+(?:\/[^\s?#]*)?$/.test(baseUrl)) {
    throw new SalesApiError('Configure EXPO_PUBLIC_API_URL com a origem HTTP(S) do gateway.', 'CONFIG');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new SalesApiError('Timeout inválido.', 'CONFIG');
  let sessionToken: string | undefined;

  async function request<T>(path: string, check: Check, body?: unknown, idempotencyKey?: string, authenticated = true): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (authenticated) {
      const token = options.getToken ? options.getToken() : sessionToken;
      if (!token) throw new SalesApiError('Entre novamente para acessar o Sales API.', 'AUTH', 401);
      headers.Authorization = `Bearer ${token}`;
    }
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/api/mobile/v1${path}`, {
        method: body === undefined ? 'GET' : 'POST', headers,
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal,
      });
      const raw = await response.text();
      let data: unknown;
      try { data = JSON.parse(raw); } catch {
        if (response.ok) throw new SalesApiError('O gateway retornou JSON inválido.', 'INVALID_RESPONSE', response.status);
      }
      if (!response.ok) {
        if (response.status === 401) throw new SalesApiError('Sessão inválida ou expirada. Entre novamente.', 'AUTH', 401);
        const message = object({ message: text })(data) ? (data as { message: string }).message : `Falha na API Sales API (HTTP ${response.status}).`;
        throw new SalesApiError(message, 'HTTP', response.status);
      }
      if (!check(data)) throw new SalesApiError(`Resposta incompatível do gateway em ${path}.`, 'INVALID_RESPONSE', response.status);
      return data as T;
    } catch (error) {
      if (timedOut) throw new SalesApiError('Tempo de conexão esgotado. Tente novamente; pedidos mantêm o mesmo identificador.', 'TIMEOUT');
      if (error instanceof SalesApiError) throw error;
      throw new SalesApiError('Não foi possível conectar ao gateway Sales API. Verifique a rede e o endereço da API.', 'NETWORK');
    } finally { clearTimeout(timer); }
  }

  return {
    async login(login, password) {
      const session = await request<Session>('/auth/login', sessionCheck, { login, password }, undefined, false);
      sessionToken = session.token;
      return session;
    },
    getBootstrap: () => request<BootstrapData>('/bootstrap', bootstrapCheck),
    submitOrder: (payload) => {
      if (!payload.order_client_id.trim()) return Promise.reject(new SalesApiError('Pedido sem identificador de idempotência.', 'INVALID_REQUEST'));
      return request<SubmitOrderResult>('/orders', submitCheck, payload, payload.order_client_id);
    },
    listOrders: () => request<TrackedOrder[]>('/orders', ordersCheck),
    getGoals: () => request<Goals>('/goals', goalsCheck),
  };
}
