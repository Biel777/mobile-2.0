import type { BootstrapData, Session, SalesApiClient } from './client';
import type { CommercialTable, Goals, SubmitOrderPayload, TrackedOrder } from '../domain/types';
import { ORDER_STATUS } from '../domain/status';
import { mobileContractChecks, SalesApiError } from './http';

/** Transport follows the supplied Legacy map. Detailed read envelopes below are a lab profile to homologate. */
export type LegacyClientOptions = {
  baseUrl: string; getSession?: () => Session | null | undefined; userId?: number;
  imei?: string; appVersion?: string; schedulePeriod?: string; timeZone?: string;
  timeoutMs?: number; fetchImpl?: typeof fetch;
};
type Raw = Record<string, any>;
const incomplete = (message: string): never => { throw new SalesApiError(`Contrato Legacy incompleto: ${message}`, 'INCOMPLETE_CONTRACT'); };
function record(value: unknown): Raw { if (!value || typeof value !== 'object' || Array.isArray(value)) return incomplete('objeto esperado'); return value; }
function list(value: unknown, label: string): Raw[] { if (!Array.isArray(value) || value.some(v => !v || typeof v !== 'object' || Array.isArray(v))) return incomplete(`${label}: lista ausente ou inválida`); return value; }
function string(value: unknown, label: string): string { if (typeof value !== 'string') return incomplete(`${label}: texto ausente`); return value; }
function numeric(value: unknown, label: string): number { if ((typeof value !== 'number' && typeof value !== 'string') || value === '' || !Number.isFinite(Number(value))) return incomplete(`${label}: número ausente`); return Number(value); }
function flag(value: unknown, label: string): boolean { if (![true, false, 0, 1, '0', '1'].includes(value as any)) return incomplete(`${label}: booleano ausente`); return value === true || value === 1 || value === '1'; }
/** A neutral field wins; a single legacy area alias is accepted without guessing between flags. */
function customerAreaFlag(customer: Raw): boolean {
  if (Object.prototype.hasOwnProperty.call(customer, 'tem_area')) return flag(customer.tem_area, 'tem_area');
  const aliases = Object.keys(customer).filter(key => key.startsWith('tem_area_'));
  if (aliases.length !== 1) return incomplete('tem_area: campo ausente ou aliases ambíguos');
  return flag(customer[aliases[0]], 'tem_area');
}
const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function legacyStatus(value: unknown): number {
  const text = string(value, 'descrição do status');
  const aliases: Record<string, number> = { 'aceito com sucesso': 1, 'sem resposta': 4, 'nao aceito pelo distribuidor': 6,
    'aberto para digitacao': 7, 'pendente margem diferenciada': 13, 'devolvido parcial': 15, 'devolvido integral': 16,
    'devolvido parcialmente': 15, 'devolvido integralmente': 16 };
  if (Object.prototype.hasOwnProperty.call(aliases, normalize(text))) return aliases[normalize(text)];
  const found = Object.entries(ORDER_STATUS).find(([, label]) => normalize(label) === normalize(text));
  if (!found) return incomplete(`status desconhecido: ${text}`);
  return Number(found[0]);
}
function pdv(v: Raw) { return { id: numeric(v.id_cliente, 'id_cliente'), name: string(v.nome, 'nome PDV'), city: string(v.cidade, 'cidade') }; }
export function mapLegacyGoals(raw: unknown): Goals {
  const v = record(raw);
  const goals: Goals = {
    periodLabel: string(v.periodo, 'periodo'), metaValor: numeric(v.meta_valor, 'meta_valor'), realizadoValor: numeric(v.realizado_valor, 'realizado_valor'),
    metaQtd: numeric(v.meta_quantidade, 'meta_quantidade'), realizadoQtd: numeric(v.realizado_quantidade, 'realizado_quantidade'),
    pdvsCarteira: numeric(v.pdvs_carteira, 'pdvs_carteira'), pdvsPositivados: numeric(v.pdvs_positivados, 'pdvs_positivados'),
    pdvsSemPositivar: list(v.pdvs_sem_positivar, 'pdvs_sem_positivar').map(pdv),
    families: list(v.familias, 'familias').map(f => ({ family: string(f.familia, 'familia'), metaPdvs: numeric(f.meta_pdvs, 'meta_pdvs'), faturados: numeric(f.faturados, 'faturados'), semPositivar: list(f.sem_positivar, 'sem_positivar').map(pdv) })),
  };
  if (!mobileContractChecks.goals(goals)) return incomplete('metas incompatíveis');
  return goals;
}
function mapProduct(price: Raw, catalog: Raw[]) {
  const info = catalog.find(p => p.ean === price.ean);
  if (!info) return incomplete('produto sem cadastro global');
  return {
    ean: string(price.ean, 'ean'), name: string(info.nome, 'nome produto'), family: info.familia,
    listPrice: numeric(price.preco_lista, 'preco_lista'), baseDiscount: numeric(price.desconto_base, 'desconto_base'),
    minQty: numeric(price.quantidade_minima, 'quantidade_minima'), maxQty: price.quantidade_maxima === undefined ? undefined : numeric(price.quantidade_maxima, 'quantidade_maxima'),
    packSize: numeric(price.multiplo, 'multiplo'), required: price.obrigatoriedade,
    isCombo: price.combo === undefined ? undefined : flag(price.combo, 'combo'),
    ceilingDiscount: price.desconto_teto === undefined ? undefined : numeric(price.desconto_teto, 'desconto_teto'),
    photoRestricted: info.foto_restrita === undefined ? undefined : flag(info.foto_restrita, 'foto_restrita'),
    tiers: list(price.faixas, 'faixas').map(t => ({ quantMin: numeric(t.quantidade_minima, 'quantidade_minima faixa'), percent: numeric(t.percentual, 'percentual') })),
  };
}
function appendForm(form: URLSearchParams, value: unknown, key: string) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) value.forEach((v, i) => appendForm(form, v, `${key}[${i}]`));
  else if (typeof value === 'object') Object.entries(value).forEach(([k, v]) => appendForm(form, v, key ? `${key}[${k}]` : k));
  else form.append(key, String(value));
}
export function legacyDateTime(value: string, timeZone = 'America/Sao_Paulo') {
  // Without an offset the source instant is ambiguous, so do not interpret it in the device zone.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value))) throw new SalesApiError('Data de criação deve incluir fuso horário ISO 8601.', 'INVALID_REQUEST');
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
    const get = (name: string) => parts.find(p => p.type === name)!.value;
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch { throw new SalesApiError('Fuso do tenant inválido. Confira EXPO_PUBLIC_API_TIMEZONE.', 'CONFIG'); }
}
export function createLegacyClient(options: LegacyClientOptions): SalesApiClient {
  const base = options.baseUrl.trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^\s?#]+$/.test(base)) throw new SalesApiError('Configure EXPO_PUBLIC_API_BASE_URL com a base Legacy.', 'CONFIG');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeout = options.timeoutMs ?? 15000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new SalesApiError('Timeout inválido.', 'CONFIG');
  const period = options.schedulePeriod ?? '08:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(period)) throw new SalesApiError('Período de agendamento inválido.', 'CONFIG');
  let localSession: Session | undefined;
  function session() {
    const s = options.getSession ? options.getSession() : localSession;
    if (!s?.token || !s.login || !s.codigoSincronizacao) throw new SalesApiError('Sessão Legacy incompleta. Entre novamente.', 'AUTH', 401);
    return s;
  }
  async function request(route: string, values: Raw = {}, method: 'GET' | 'POST' = 'POST', auth = true): Promise<Raw> {
    const s = auth ? session() : undefined;
    const fields = { ...(s ? { user: { login: s.login, token: s.token, codigo_sincronizacao: s.codigoSincronizacao } } : {}), ...values };
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (key === 'pedidos' && Array.isArray(value)) value.forEach(id => form.append('pedidos[]', String(id)));
      else appendForm(form, value, key);
    }
    const url = `${base.endsWith('/index.php') ? base : `${base}/index.php`}?r=api/${route}${method === 'GET' ? `&${form.toString()}` : ''}`;
    const controller = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeout);
    try {
      const response = await fetchImpl(url, { method, headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body: method === 'POST' ? form.toString() : undefined, signal: controller.signal });
      let data: Raw;
      try { data = record(JSON.parse(await response.text())); } catch (e) {
        if (!response.ok) throw new SalesApiError(`Falha Legacy HTTP ${response.status}.`, response.status === 401 ? 'AUTH' : 'HTTP', response.status);
        if (e instanceof SalesApiError) throw e;
        throw new SalesApiError('Legacy retornou JSON inválido.', 'INVALID_RESPONSE');
      }
      if (!response.ok) throw new SalesApiError(typeof data.mensagem === 'string' ? data.mensagem : `Falha Legacy HTTP ${response.status}.`, response.status === 401 ? 'AUTH' : 'HTTP', response.status);
      if (data.status === 'erro') {
        const messages = [data.mensagem, ...(Array.isArray(data.errors) ? data.errors : []), data.id_pre_pedido ? `Pré-pedido ${data.id_pre_pedido}` : ''].filter(v => typeof v === 'string' && v.trim()).join(' — ');
        throw new SalesApiError(messages || 'Operação rejeitada pelo Legacy.', 'LEGACY_REJECTED');
      }
      return data;
    } catch (e) {
      if (timedOut) throw new SalesApiError('Tempo de conexão Legacy esgotado. Confirme o pedido remoto antes de reenviar.', 'TIMEOUT');
      if (e instanceof SalesApiError) throw e;
      throw new SalesApiError('Não foi possível conectar ao Legacy.', 'NETWORK');
    } finally { clearTimeout(timer); }
  }
  async function getStatuses(ids: number[]) {
    return list((await request('pedidos/getStatusPedidos', { pedidos: ids }, 'GET')).pedidos, 'pedidos');
  }
  async function getGoals() { return mapLegacyGoals(await request('metas/desempenhoArea')); }
  async function getOrderStatus(id: number) {
    if (!Number.isInteger(id) || id <= 0) throw new SalesApiError('Identificador remoto inválido.', 'INVALID_REQUEST');
    try {
      const status = (await getStatuses([id])).find(p => Number(p.id) === id);
      if (!status) return incomplete(`pedido ${id} sem status retornado`);
      const mapped = legacyStatus(status.status);
      if (mapped === 7) return incomplete(`pedido ${id} ainda em digitação`);
      return { id_pedido_gerado: id, id_status: mapped, erros_envio: [] };
    } catch (e) { throw Object.assign(new SalesApiError(`Pedido remoto ${id}: confirmação do status pendente. Consulte antes de reenviar. ${e instanceof Error ? e.message : ''}`, 'STATUS_PENDING', e instanceof SalesApiError ? e.status : undefined), { remoteId: id }); }
  }
  return {
    async login(login, password) {
      const result = await request('authentication/new', { user: { login, senha: password, imei: options.imei ?? 'mobile-app', versao: options.appVersion ?? '0.1.0' } }, 'POST', false);
      if (result.status !== 'ok') return incomplete('status do login');
      const userId = Number(result.id_usuario ?? options.userId);
      if (!Number.isInteger(userId) || userId <= 0) return incomplete('login não fornece id_usuario; configure EXPO_PUBLIC_API_USER_ID. id_nivel não identifica o representante.');
      const token = string(result.token, 'token');
      const sync = result.codigo_sincronizacao;
      if (!token || sync === undefined || sync === null || String(sync) === '') return incomplete('token ou codigo_sincronizacao ausente');
      localSession = { token, userId, name: typeof result.nome === 'string' ? result.nome : login, login: string(result.login ?? login, 'login'), codigoSincronizacao: String(sync), imei: options.imei ?? 'mobile-app', versao: options.appVersion ?? '0.1.0' };
      return localSession;
    },
    async refreshSession() {
      const s = session();
      const result = await request('session/new', { user: { login: s.login, token: s.token, versao: s.versao ?? options.appVersion ?? '0.1.0' } }, 'POST', false);
      if (result.codigo_sincronizacao === undefined) return incomplete('codigo_sincronizacao ausente no refresh');
      localSession = { ...s, codigoSincronizacao: String(result.codigo_sincronizacao) };
      return localSession;
    },
    async getBootstrap() {
      const s = session();
      const [clientsRaw, tablesRaw, linksRaw, productsRaw, goals] = await Promise.all([
        request('clientes/index'), request('negociacoes/index', { extras: { somente_mobile: 1 } }, 'GET'),
        request('clientes/getClientesTabelasNegociacoes', { somente_mobile: 1 }), request('produtos/index'), getGoals(),
      ]);
      const links = list(linksRaw.vinculos, 'vinculos');
      const catalog = list(productsRaw.produtos, 'produtos');
      const customers: BootstrapData['customers'] = [];
      for (const c of list(clientsRaw.clientes, 'clientes')) {
        const distributorsRaw = await request('clientes/getDistribuidores', { cnpj_cliente: c.cnpj }, 'GET');
        customers.push({ ...pdv(c), cnpj: string(c.cnpj, 'cnpj'), areaId: numeric(c.id_area, 'id_area'), hasSalesArea: customerAreaFlag(c),
          tableIds: links.filter(v => Number(v.id_cliente) === Number(c.id_cliente)).map(v => numeric(v.id_tabela, 'id_tabela vínculo')),
          distributors: list(distributorsRaw.distribuidores, 'distribuidores').map(d => ({
            id: numeric(d.id_distribuidor, 'id_distribuidor'), name: string(d.nome, 'nome distribuidor'), priority: numeric(d.prioridade, 'prioridade'),
            tipoEnvio: numeric(d.tipo_envio, 'tipo_envio') as 1 | 2, prazos: Array.isArray(d.prazos) ? d.prazos.map((p: unknown) => numeric(p, 'prazo')) : incomplete('prazos ausentes'),
            codigoFaturamentoPorPrazo: Object.fromEntries(Object.entries(record(d.codigo_faturamento_por_prazo)).map(([prazo, code]) => {
              if (!Number.isFinite(Number(prazo)) || Number(prazo) <= 0 || !['string', 'number'].includes(typeof code) || !String(code).trim()) return incomplete('código de faturamento por prazo inválido');
              return [prazo, String(code)];
            })),
          })),
        });
      }
      const tables: CommercialTable[] = [];
      for (const t of list(tablesRaw.negociacoes, 'negociacoes')) {
        const id = numeric(t.id_tabela, 'id_tabela');
        let products: CommercialTable['products'] | undefined;
        for (const customer of customers.filter(c => c.tableIds.includes(id))) {
          for (const distributor of customer.distributors) {
            const priceRaw = await request('produtos/getProdutosDaTabela', { id_cliente: customer.id, id_tabela: id, id_distribuidor: distributor.id });
            const mapped = list(priceRaw.produtos, 'produtos da tabela').map(p => mapProduct(p, catalog)).sort((a, b) => a.ean.localeCompare(b.ean));
            if (products && JSON.stringify(products) !== JSON.stringify(mapped)) return incomplete(`preços diferentes por PDV/distribuidor na tabela ${id}; o modelo global atual precisa ser adaptado antes de operar.`);
            products = mapped;
          }
        }
        if (!products) continue;
        tables.push({ id, name: string(t.nome, 'nome tabela'), minValue: numeric(t.valor_minimo, 'valor_minimo'), minValueBasis: t.base_minimo,
          expiresAt: string(t.data_validade, 'data_validade'), onlyMobile: flag(t.somente_mobile, 'somente_mobile'), products,
          dividePedido: t.permitir_dividir_pedidos_agendados === undefined ? undefined : flag(t.permitir_dividir_pedidos_agendados, 'dividir pedidos'),
          comboParticipation: t.participacao_combo === undefined ? undefined : numeric(t.participacao_combo, 'participacao_combo'),
          monthBilledNet: t.faturado_mes === undefined ? undefined : numeric(t.faturado_mes, 'faturado_mes'),
          triggers: list(t.gatilhos, 'gatilhos').map(g => ({ triggerEan: string(g.ean_gatilho, 'ean_gatilho'), threshold: numeric(g.quantidade, 'quantidade gatilho'), childEan: string(g.ean_filho, 'ean_filho'), extraPercent: numeric(g.percentual_extra, 'percentual_extra') })),
        });
      }
      const result: BootstrapData = { user: { id: s.userId, name: s.name, login: s.login!, area: typeof clientsRaw.area === 'string' ? clientsRaw.area : '', bloqueiaNegociado: clientsRaw.bloqueia_negociado === undefined ? true : flag(clientsRaw.bloqueia_negociado, 'bloqueia_negociado') }, customers, tables, goals, coupons: [], flags: [], unsupportedFeatures: ['coupons', 'flags'], integrationWarnings: [
        'Legacy: envelopes de leitura e base de metas seguem perfil de laboratório, a homologar no tenant.',
        'Cupons e metas de bandeira não possuem contrato confirmado e estão indisponíveis.',
        'Regras de autorização e área do representante precisam de homologação; negociação manual permanece bloqueada por padrão.',
        'Deduplicação de pedidos por order_client_id precisa de homologação; confirme pedidos remotos após falhas de confirmação.',
      ] };
      if (!mobileContractChecks.bootstrap(result)) return incomplete('cadastros ou condições comerciais incompatíveis com o app');
      return result;
    },
    async submitOrder(payload: SubmitOrderPayload) {
      if (payload.cupom) throw new SalesApiError('Cupom não possui campo Legacy confirmado. Remova o cupom para enviar.', 'UNSUPPORTED_FIELD');
      if (!payload.order_client_id?.trim()) throw new SalesApiError('Pedido sem identificador estável.', 'INVALID_REQUEST');
      if (payload.array_ordem_envio.some(d => !d.codigo_faturamento)) throw new SalesApiError('Confirme o código de faturamento para cada prazo e distribuidor.', 'INVALID_REQUEST');
      if (payload.array_produtos.some(p => !Number.isFinite(p.desconto))) throw new SalesApiError('Desconto calculado obrigatório para todos os produtos.', 'INVALID_REQUEST');
      const date = legacyDateTime(payload.datahora_criacao, options.timeZone);
      let response: Raw;
      try { response = await request('pedidos/receberPedidoMobile', {
        id_cliente: payload.id_cliente, id_tabela: payload.id_tabela, datahora_criacao: date,
        order_client_id: payload.order_client_id, codigo_pedido: payload.codigo_pedido, justificativa: payload.justificativa,
        ordem_envio: payload.array_ordem_envio.map(d => ({ id_distribuidor: d.id_distribuidor, prioridade: d.prioridade, codigo_faturamento: d.codigo_faturamento })),
        produtos: payload.array_produtos.map(p => ({ ean: p.ean, quantidade: p.quantidade, desconto: p.desconto })),
        agendamento: payload.array_agendamento?.map(d => ({ data: d.data_envio, periodo: period })),
      }); } catch (e) {
        if (e instanceof SalesApiError && e.code === 'LEGACY_REJECTED') return { id_pedido_gerado: 0, id_status: 7, erros_envio: [e.message] };
        throw e;
      }
      const id = numeric(response.id_pedido, 'id_pedido');
      if (response.status !== 'ok' || !Number.isInteger(id) || id <= 0) return incomplete('envio sem confirmação e id_pedido válido');
      return getOrderStatus(id);
    },
    async listOrders() {
      const raw = await request('subPedidos/index', { time: '1970-01-01 00:00:00' });
      const subs = list(raw.subPedidos, 'subPedidos');
      if (!subs.length) return [];
      const ids = [...new Set(subs.map(s => numeric(s.pedido_id, 'pedido_id')))];
      const [statusesRaw, notesRaw] = await Promise.all([getStatuses(ids), request('nota/index')]);
      const notes = list(notesRaw.notas, 'notas');
      const result: TrackedOrder[] = ids.map(id => {
        const status = statusesRaw.find(p => Number(p.id) === id);
        if (!status) return incomplete(`status do pedido ${id} ausente`);
        const firstSub = subs.find(sub => Number(sub.pedido_id) === id);
        const customerId = status.id_cliente ?? firstSub?.id_cliente;
        const customerCnpj = status.cnpj_cliente ?? firstSub?.cnpj_cliente;
        return { id, customerId: customerId == null || customerId === '' ? undefined : numeric(customerId, 'id_cliente pedido'),
          customerCnpj: customerCnpj == null || customerCnpj === '' ? undefined : string(customerCnpj, 'cnpj_cliente pedido'), orderClientId: string(status.order_client_id, 'order_client_id'), customerName: string(status.nome_cliente, 'nome_cliente'), tableName: string(status.nome_tabela, 'nome_tabela'),
          status: legacyStatus(status.status), prazo: numeric(status.prazo, 'prazo'), dataEnvio: status.data_envio || undefined, createdAt: string(status.datahora_criacao, 'datahora_criacao'),
          subOrders: subs.filter(s => Number(s.pedido_id) === id).map(s => {
            const subId = numeric(s.id_subpedido, 'id_subpedido'); const note = notes.find(n => Number(n.id_subpedido) === subId);
            return { id: subId, distributorName: string(s.distribuidor, 'distribuidor'), status: numeric(s.status_id, 'status_id'), prazo: numeric(s.prazo, 'prazo'),
              items: list(s.produtos, 'produtos do subpedido').map(p => ({ ean: string(p.ean, 'ean'), name: string(p.nome, 'nome'), unitPrice: numeric(p.preco, 'preco'), discountPercent: numeric(p.desconto, 'desconto'), quantPed: numeric(p.quantidade_pedida, 'quantidade_pedida'), quantEsp: numeric(p.quantidade_prevista, 'quantidade_prevista'), quantNot: numeric(p.quantidade_confirmada, 'quantidade_confirmada'), reason: p.motivo })),
              invoice: note ? { number: string(note.numero, 'numero nota'), value: numeric(note.valor, 'valor nota'), issuedAt: string(note.data_emissao, 'data_emissao') } : undefined,
            };
          }),
        };
      });
      if (!mobileContractChecks.orders(result)) return incomplete('acompanhamento incompatível');
      return result;
    },
    getGoals,
    getOrderStatus,
  };
}
