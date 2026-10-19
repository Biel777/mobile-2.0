import { createLegacyTransport } from './legacy-transport';
import {
  incomplete,
  list,
  string,
  numeric,
  flag,
  customerAreaFlag,
  pdv,
  mapProduct,
  mapLegacyGoals,
  legacyStatus,
  record,
  type Raw,
} from './legacy-map';
import type { BootstrapData, Session, SalesApiClient } from './client';
import type { CommercialTable, SubmitOrderPayload, TrackedOrder } from '@rules/types';

import { mobileContractChecks, SalesApiError } from './http';
export { mapLegacyGoals, legacyStatus } from './legacy-map';

/** Transport follows the supplied Legacy map. Detailed read envelopes below are a lab profile to homologate. */
export type LegacyClientOptions = {
  baseUrl: string;
  getSession?: () => Session | null | undefined;
  userId?: number;
  imei?: string;
  appVersion?: string;
  schedulePeriod?: string;
  timeZone?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  customerLimit?: number;
  getLastOrderSync?: () => string | undefined;
  getCachedOrders?: () => TrackedOrder[];
};
export function legacyDateTime(value: string, timeZone = 'America/Sao_Paulo') {
  // Without an offset the source instant is ambiguous, so do not interpret it in the device zone.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !Number.isFinite(Date.parse(value)))
    throw new SalesApiError(
      'Data de criação deve incluir fuso horário ISO 8601.',
      'INVALID_REQUEST',
    );
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(value));
    const get = (name: string) => parts.find((p) => p.type === name)!.value;
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
  } catch {
    throw new SalesApiError('Fuso do tenant inválido. Confira EXPO_PUBLIC_API_TIMEZONE.', 'CONFIG');
  }
}
export function createLegacyClient(options: LegacyClientOptions): SalesApiClient {
  const period = options.schedulePeriod ?? '08:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(period))
    throw new SalesApiError('Período de agendamento inválido.', 'CONFIG');
  let localSession: Session | undefined;
  let orderSyncTime: string | undefined;
  let cachedOrders: TrackedOrder[] = [];
  const customerLimit = options.customerLimit ?? 1;
  if (!Number.isInteger(customerLimit) || customerLimit < 1)
    throw new SalesApiError('Limite de PDVs inválido.', 'CONFIG');
  function session() {
    const s = options.getSession ? options.getSession() : localSession;
    if (!s?.token || !s.login || !s.codigoSincronizacao)
      throw new SalesApiError('Sessão Legacy incompleta. Entre novamente.', 'AUTH', 401);
    return s;
  }
  const request = createLegacyTransport(options, session);
  async function getStatuses(ids: number[]) {
    return list(
      (await request('pedidos/getStatusPedidos', { pedidos: ids }, 'GET')).pedidos,
      'pedidos',
    );
  }
  async function getGoals() {
    return mapLegacyGoals(await request('metas/desempenhoArea'));
  }
  async function getOrderStatus(id: number) {
    if (!Number.isInteger(id) || id <= 0)
      throw new SalesApiError('Identificador remoto inválido.', 'INVALID_REQUEST');
    try {
      const status = (await getStatuses([id])).find((p) => Number(p.id) === id);
      if (!status) return incomplete(`pedido ${id} sem status retornado`);
      const mapped = legacyStatus(status.status);
      if (mapped === 7) return incomplete(`pedido ${id} ainda em digitação`);
      return { id_pedido_gerado: id, id_status: mapped, erros_envio: [] };
    } catch (e) {
      throw Object.assign(
        new SalesApiError(
          `Pedido remoto ${id}: confirmação do status pendente. Consulte antes de reenviar. ${e instanceof Error ? e.message : ''}`,
          'STATUS_PENDING',
          e instanceof SalesApiError ? e.status : undefined,
        ),
        { remoteId: id },
      );
    }
  }
  return {
    async login(login, password) {
      const result = await request(
        'authentication/new',
        {
          user: {
            login,
            senha: password,
            imei: options.imei ?? 'mobile-app',
            versao: options.appVersion ?? '0.1.0',
          },
        },
        'POST',
        false,
      );
      if (result.status !== 'ok') return incomplete('status do login');
      const userId = Number(result.id ?? result.id_usuario ?? options.userId);
      if (!Number.isInteger(userId) || userId <= 0)
        return incomplete(
          'login não fornece id ou id_usuario. id_nivel não identifica o representante.',
        );
      const token = string(result.token, 'token');
      const sync = result.codigo_sincronizacao;
      if (!token || sync === undefined || sync === null || String(sync) === '')
        return incomplete('token ou codigo_sincronizacao ausente');
      cachedOrders = [];
      orderSyncTime = undefined;
      localSession = {
        token,
        userId,
        name: typeof result.nome === 'string' ? result.nome : login,
        login: string(result.login ?? login, 'login'),
        codigoSincronizacao: String(sync),
        imei: options.imei ?? 'mobile-app',
        versao: options.appVersion ?? '0.1.0',
      };
      return localSession;
    },
    async refreshSession() {
      const s = session();
      const result = await request(
        'session/new',
        {
          user: {
            login: s.login,
            token: s.token,
            versao: s.versao ?? options.appVersion ?? '0.1.0',
          },
        },
        'POST',
        false,
      );
      if (result.codigo_sincronizacao === undefined)
        return incomplete('codigo_sincronizacao ausente no refresh');
      localSession = { ...s, codigoSincronizacao: String(result.codigo_sincronizacao) };
      return localSession;
    },
    async getBootstrap() {
      // TODO(TL) CR-04: não foi possível homologar esta sync sem acesso/conta do tenant.
      // Gravar fixture real anonimizada antes de mapear campos comerciais, área, mix e histórico.

      const s = session();
      const [clientsRaw, tablesRaw, linksRaw, productsRaw, goals] = await Promise.all([
        request('clientes/index'),
        request('negociacoes/index', { extras: { somente_mobile: 1 } }, 'GET'),
        request('clientes/getClientesTabelasNegociacoes', { somente_mobile: 1 }),
        request('produtos/index'),
        getGoals(),
      ]);
      const links = list(linksRaw.vinculos, 'vinculos');
      const catalog = list(productsRaw.produtos, 'produtos');
      const customers: BootstrapData['customers'] = [];
      for (const c of list(clientsRaw.clientes, 'clientes').slice(0, customerLimit)) {
        const distributorsRaw = await request(
          'clientes/getDistribuidores',
          { cnpj_cliente: c.cnpj },
          'GET',
        );
        customers.push({
          ...pdv(c),
          cnpj: string(c.cnpj, 'cnpj'),
          areaId: numeric(c.id_area, 'id_area'),
          hasSalesArea: customerAreaFlag(c),
          tableIds: links
            .filter((v) => Number(v.id_cliente) === Number(c.id ?? c.id_cliente))
            .map((v) => numeric(v.id_tabela, 'id_tabela vínculo')),
          distributors: list(distributorsRaw.distribuidores, 'distribuidores').map((d) => ({
            id: numeric(d.id_distribuidor, 'id_distribuidor'),
            name: string(d.nome, 'nome distribuidor'),
            priority: numeric(d.prioridade, 'prioridade'),
            tipoEnvio: numeric(d.tipo_envio, 'tipo_envio') as 1 | 2,
            prazos: Array.isArray(d.prazos)
              ? d.prazos.map((p: unknown) => numeric(p, 'prazo'))
              : incomplete('prazos ausentes'),
            // TODO(TL) CR-09: confirmar no Transfer Order o campo real de faturamento; não inferir do distribuidor.
            codigoFaturamentoPorPrazo: Object.fromEntries(
              Object.entries(record(d.codigo_faturamento_por_prazo)).map(([prazo, code]) => {
                if (
                  !Number.isFinite(Number(prazo)) ||
                  Number(prazo) <= 0 ||
                  !['string', 'number'].includes(typeof code) ||
                  !String(code).trim()
                )
                  return incomplete('código de faturamento por prazo inválido');
                return [prazo, String(code)];
              }),
            ),
          })),
        });
      }
      const tables: CommercialTable[] = [];
      for (const t of list(tablesRaw.tabelas ?? tablesRaw.negociacoes, 'tabelas')) {
        const id = numeric(t.id_tabela, 'id_tabela');
        let products: CommercialTable['products'] | undefined;
        const priceContexts: NonNullable<CommercialTable['priceContexts']> = [];
        for (const customer of customers.filter((c) => c.tableIds.includes(id))) {
          for (const distributor of customer.distributors) {
            const priceRaw = await request('produtos/getProdutosDaTabela', {
              id_cliente: customer.id,
              id_tabela: id,
              id_distribuidor: distributor.id,
            });
            const mapped = list(priceRaw.produtos, 'produtos da tabela')
              .map((p) => mapProduct(p, catalog))
              .sort((a, b) => a.ean.localeCompare(b.ean));
            priceContexts.push({
              customerId: customer.id,
              distributorId: distributor.id,
              products: mapped,
            });
            products ??= mapped;
          }
        }
        if (!products) continue;
        tables.push({
          id,
          name: string(t.nome, 'nome tabela'),
          minValue: numeric(t.valor_minimo, 'valor_minimo'),
          minValueBasis: t.base_minimo,
          expiresAt: string(t.data_validade, 'data_validade'),
          onlyMobile: flag(t.somente_mobile, 'somente_mobile'),
          products,
          priceContexts,
          dividePedido:
            t.permitir_dividir_pedidos_agendados === undefined
              ? undefined
              : flag(t.permitir_dividir_pedidos_agendados, 'dividir pedidos'),
          comboParticipation:
            t.participacao_combo === undefined
              ? undefined
              : numeric(t.participacao_combo, 'participacao_combo'),
          monthBilledNet:
            t.faturado_mes === undefined ? undefined : numeric(t.faturado_mes, 'faturado_mes'),
          triggers: list(t.gatilhos, 'gatilhos').map((g) => ({
            triggerEan: string(g.ean_gatilho, 'ean_gatilho'),
            threshold: numeric(g.quantidade, 'quantidade gatilho'),
            childEan: string(g.ean_filho, 'ean_filho'),
            extraPercent: numeric(g.percentual_extra, 'percentual_extra'),
          })),
        });
      }
      const result: BootstrapData = {
        user: {
          id: s.userId,
          name: s.name,
          login: s.login!,
          area: typeof clientsRaw.area === 'string' ? clientsRaw.area : '',
          bloqueiaNegociado:
            clientsRaw.bloqueia_negociado === undefined
              ? true
              : flag(clientsRaw.bloqueia_negociado, 'bloqueia_negociado'),
        },
        customers,
        tables,
        goals,
        coupons: [],
        flags: [],
        unsupportedFeatures: ['coupons', 'flags'],
        integrationWarnings: [
          `Primeira prova limitada a ${customerLimit} PDV(s); expansão da carteira e cursores de clientes dependem de homologação pelo TL.`,
          'Legacy: envelopes de leitura e base de metas seguem perfil de laboratório, a homologar no tenant.',
          'Cupons e metas de bandeira não possuem contrato confirmado e estão indisponíveis.',
          'Regras de autorização e área do representante precisam de homologação; negociação manual permanece bloqueada por padrão.',
          'Deduplicação de pedidos por order_client_id precisa de homologação; confirme pedidos remotos após falhas de confirmação.',
        ],
      };
      if (!mobileContractChecks.bootstrap(result))
        return incomplete('cadastros ou condições comerciais incompatíveis com o app');
      return result;
    },
    async submitOrder(payload: SubmitOrderPayload) {
      if (payload.cupom)
        throw new SalesApiError(
          'Cupom não possui campo Legacy confirmado. Remova o cupom para enviar.',
          'UNSUPPORTED_FIELD',
        );
      if (!payload.order_client_id?.trim())
        throw new SalesApiError('Pedido sem identificador estável.', 'INVALID_REQUEST');
      if (payload.array_ordem_envio.some((d) => !d.codigo_faturamento))
        throw new SalesApiError(
          'Confirme o código de faturamento para cada prazo e distribuidor.',
          'INVALID_REQUEST',
        );
      if (payload.array_produtos.some((p) => !Number.isFinite(p.desconto)))
        throw new SalesApiError(
          'Desconto calculado obrigatório para todos os produtos.',
          'INVALID_REQUEST',
        );
      const date = legacyDateTime(payload.datahora_criacao, options.timeZone);
      let response: Raw;
      try {
        response = await request('pedidos/receberPedidoMobile', {
          id_cliente: payload.id_cliente,
          id_tabela: payload.id_tabela,
          datahora_criacao: date,
          order_client_id: payload.order_client_id,
          codigo_pedido: payload.codigo_pedido,
          justificativa: payload.justificativa,
          ordem_envio: payload.array_ordem_envio.map((d) => ({
            id_distribuidor: d.id_distribuidor,
            prioridade: d.prioridade,
            codigo_faturamento: d.codigo_faturamento,
          })),
          produtos: payload.array_produtos.map((p) => ({
            ean: p.ean,
            quantidade: p.quantidade,
            desconto: p.desconto,
          })),
          // TODO(TL): homologar a associação de quantidades por data no PHP; só há prévia local da divisão.
          agendamento: payload.array_agendamento?.map((d) => ({
            data: d.data_envio,
            periodo: period,
          })),
        });
      } catch (e) {
        if (e instanceof SalesApiError && e.code === 'LEGACY_REJECTED')
          return { id_pedido_gerado: 0, id_status: 7, erros_envio: [e.message] };
        throw e;
      }
      const id = numeric(response.id_pedido, 'id_pedido');
      if (response.status !== 'ok' || !Number.isInteger(id) || id <= 0)
        return incomplete('envio sem confirmação e id_pedido válido');
      return getOrderStatus(id);
    },
    async listOrders() {
      const startedAt = new Date().toISOString();
      const previous = options.getCachedOrders?.() ?? cachedOrders;
      const since =
        options.getLastOrderSync?.() ??
        orderSyncTime ??
        new Date(Date.now() - 30 * 86400000).toISOString();
      // TODO(TL) CR-07: homologar ids_clientes/codigo_sincronizacao e o filtro da rota nota/index.
      // O cursor só avança após validar a resposta; sobrepor um segundo evita perder a borda.
      const time = legacyDateTime(
        new Date(Date.parse(since) - 1000).toISOString(),
        options.timeZone,
      );
      const raw = await request('subPedidos/index', { time });
      const subs = list(raw.subPedidos, 'subPedidos');
      if (!subs.length) {
        orderSyncTime = startedAt;
        cachedOrders = previous;
        return previous;
      }
      const ids = [...new Set(subs.map((s) => numeric(s.pedido_id, 'pedido_id')))];
      const [statusesRaw, notesRaw] = await Promise.all([getStatuses(ids), request('nota/index')]);
      const notes = list(notesRaw.notas, 'notas');
      const result: TrackedOrder[] = ids.map((id) => {
        const status = statusesRaw.find((p) => Number(p.id) === id);
        if (!status) return incomplete(`status do pedido ${id} ausente`);
        const firstSub = subs.find((sub) => Number(sub.pedido_id) === id);
        const customerId = status.id_cliente ?? firstSub?.id_cliente;
        const customerCnpj = status.cnpj_cliente ?? firstSub?.cnpj_cliente;
        return {
          id,
          customerId:
            customerId == null || customerId === ''
              ? undefined
              : numeric(customerId, 'id_cliente pedido'),
          customerCnpj:
            customerCnpj == null || customerCnpj === ''
              ? undefined
              : string(customerCnpj, 'cnpj_cliente pedido'),
          orderClientId: string(status.order_client_id, 'order_client_id'),
          customerName: string(status.nome_cliente, 'nome_cliente'),
          tableName: string(status.nome_tabela, 'nome_tabela'),
          status: legacyStatus(status.status),
          prazo: numeric(status.prazo, 'prazo'),
          dataEnvio: status.data_envio || undefined,
          createdAt: string(status.datahora_criacao, 'datahora_criacao'),
          subOrders: subs
            .filter((s) => Number(s.pedido_id) === id)
            .map((s) => {
              const subId = numeric(s.id_subpedido, 'id_subpedido');
              const note = notes.find((n) => Number(n.id_subpedido) === subId);
              return {
                id: subId,
                distributorName: string(s.distribuidor, 'distribuidor'),
                status: numeric(s.status_id, 'status_id'),
                prazo: numeric(s.prazo, 'prazo'),
                items: list(s.produtos, 'produtos do subpedido').map((p) => ({
                  ean: string(p.ean, 'ean'),
                  name: string(p.nome, 'nome'),
                  unitPrice: numeric(p.preco, 'preco'),
                  discountPercent: numeric(p.desconto, 'desconto'),
                  quantPed: numeric(p.quantidade_pedida, 'quantidade_pedida'),
                  quantEsp: numeric(p.quantidade_prevista, 'quantidade_prevista'),
                  quantNot: numeric(p.quantidade_confirmada, 'quantidade_confirmada'),
                  reason: p.motivo,
                })),
                invoice: note
                  ? {
                      number: string(note.numero, 'numero nota'),
                      value: numeric(note.valor, 'valor nota'),
                      issuedAt: string(note.data_emissao, 'data_emissao'),
                    }
                  : undefined,
              };
            }),
        };
      });
      if (!mobileContractChecks.orders(result)) return incomplete('acompanhamento incompatível');
      const merged = new Map(previous.map((order) => [order.id, order]));
      for (const order of result) {
        const older = merged.get(order.id);
        const subOrders = new Map(older?.subOrders.map((sub) => [sub.id, sub]) ?? []);
        order.subOrders.forEach((sub) =>
          subOrders.set(sub.id, { ...sub, invoice: sub.invoice ?? subOrders.get(sub.id)?.invoice }),
        );
        merged.set(order.id, { ...order, subOrders: [...subOrders.values()] });
      }
      cachedOrders = [...merged.values()];
      orderSyncTime = startedAt;
      return cachedOrders;
    },
    getGoals,
    getOrderStatus,
  };
}
