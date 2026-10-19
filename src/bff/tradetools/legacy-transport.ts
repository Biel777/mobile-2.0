import type { Session } from './client';
import type { LegacyClientOptions } from './legacy';
import { record, type Raw } from './legacy-map';
import { SalesApiError } from './http';
function appendForm(form: URLSearchParams, value: unknown, key: string) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) value.forEach((v, i) => appendForm(form, v, `${key}[${i}]`));
  else if (typeof value === 'object')
    Object.entries(value).forEach(([k, v]) => appendForm(form, v, key ? `${key}[${k}]` : k));
  else form.append(key, String(value));
}

export function createLegacyTransport(options: LegacyClientOptions, session: () => Session) {
  const base = options.baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s?#]+$/.test(base))
    throw new SalesApiError('Configure EXPO_PUBLIC_API_BASE_URL com a base Legacy.', 'CONFIG');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = options.timeoutMs ?? 15000;
  if (!Number.isFinite(timeout) || timeout <= 0)
    throw new SalesApiError('Timeout inválido.', 'CONFIG');
  async function request(
    route: string,
    values: Raw = {},
    method: 'GET' | 'POST' = 'POST',
    auth = true,
  ): Promise<Raw> {
    const s = auth ? session() : undefined;
    const fields = {
      ...(s
        ? { user: { login: s.login, token: s.token, codigo_sincronizacao: s.codigoSincronizacao } }
        : {}),
      ...values,
    };
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'pedidos' && Array.isArray(value))
        value.forEach((id) => form.append('pedidos[]', String(id)));
      else appendForm(form, value, key);
    }
    const url = `${base.endsWith('/index.php') ? base : `${base}/index.php`}?r=api/${route}${method === 'GET' ? `&${form.toString()}` : ''}`;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);
    try {
      const response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        },
        body: method === 'POST' ? form.toString() : undefined,
        signal: controller.signal,
      });
      let data: Raw;
      try {
        data = record(JSON.parse(await response.text()));
      } catch (e) {
        if (!response.ok)
          throw new SalesApiError(
            `Falha Legacy HTTP ${response.status}.`,
            response.status === 401 ? 'AUTH' : 'HTTP',
            response.status,
          );
        if (e instanceof SalesApiError) throw e;
        throw new SalesApiError('Legacy retornou JSON inválido.', 'INVALID_RESPONSE');
      }
      if (!response.ok)
        throw new SalesApiError(
          typeof data.mensagem === 'string'
            ? data.mensagem
            : `Falha Legacy HTTP ${response.status}.`,
          response.status === 401 ? 'AUTH' : 'HTTP',
          response.status,
        );
      if (data.status === 'erro') {
        const messages = [
          data.mensagem,
          ...(Array.isArray(data.errors) ? data.errors : []),
          data.id_pre_pedido ? `Pré-pedido ${data.id_pre_pedido}` : '',
        ]
          .filter((v) => typeof v === 'string' && v.trim())
          .join(' — ');
        throw new SalesApiError(messages || 'Operação rejeitada pelo Legacy.', 'LEGACY_REJECTED');
      }
      return data;
    } catch (e) {
      if (timedOut)
        throw new SalesApiError(
          'Tempo de conexão Legacy esgotado. Confirme o pedido remoto antes de reenviar.',
          'TIMEOUT',
        );
      if (e instanceof SalesApiError) throw e;
      throw new SalesApiError('Não foi possível conectar ao Legacy.', 'NETWORK');
    } finally {
      clearTimeout(timer);
    }
  }
  return request;
}
