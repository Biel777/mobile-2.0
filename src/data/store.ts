import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createSalesApiClient, apiConfig } from '../api';
import type { BootstrapData, Session, SalesApiClient } from '../api/client';
import { getVisitCustomers, validVisitDate, type Visit } from '../domain/visits';
import { quoteOrder } from '../domain/pricing';
import { acceptanceNotice } from '../domain/notices';
import { isAttention, reconcileOrderUpdates, type OrderUpdate } from '../domain/order-updates';
import type { LocalOrder, StatusNotice, TrackedOrder } from '../domain/types';
import { flushQueue } from '../sync/queue';
import { emptyCatalog } from './catalog';
import { appStorage } from './storage';

type AppState = {
  hydrated: boolean; online: boolean; session: Session | null; ownerId?: number;
  catalog: BootstrapData; orders: LocalOrder[]; tracked: TrackedOrder[]; notices: StatusNotice[]; orderUpdates: OrderUpdate[];
  visits: Visit[];
  addVisit: (customerId: number, date: string) => void; removeVisit: (customerId: number, date: string) => void;
  setVisitCompleted: (customerId: number, date: string, completed: boolean) => void;
  lastSync?: string; syncError?: string; syncing: boolean; authRequired: boolean;
  markOrderUpdateRead: (key: string) => void; reviewOrderUpdate: (key: string) => void; markAllOrderUpdatesRead: () => void;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void; setOnline: (online: boolean) => void;
  createDraft: (customerId: number, tableId: number, customerName?: string) => string;
  updateDraft: (id: string, patch: Partial<LocalOrder>) => void;
  enqueue: (id: string) => void; retryUncertain: (id: string) => void; flush: () => Promise<void>;
  refreshTracked: () => Promise<void>; pullUpdates: () => Promise<void>;
};

export function createAppStore(storage: StateStorage, suppliedClient?: SalesApiClient) {
  let generation = 0;
  let flushing = false;
  const store = create<AppState>()(persist((rawSet, get) => {
    // Queue failures are observed even when the subsequent list request fails.
    const set = (patch: Partial<AppState>) => {
      const state = get();
      if (patch.orders || patch.tracked) {
        patch.orderUpdates = reconcileOrderUpdates(patch.orderUpdates ?? state.orderUpdates ?? [], patch.tracked ?? state.tracked,
          patch.orders ?? state.orders, new Date().toISOString(), !state.lastSync);
      }
      rawSet(patch);
    };
    const client = suppliedClient ?? createSalesApiClient({ ...apiConfig, getToken: () => get().session?.token, getSession: () => get().session });
    const fail = (error: unknown) => {
      const message = error instanceof Error ? error.message : 'Falha de sincronização';
      const expired = (error as { status?: number })?.status === 401;
      set({ syncError: message, ...(expired ? { authRequired: true } : {}) });
    };
    const validateVisit = (customerId: number, date: string, requireCustomer = true) => {
      const state = get();
      if (!state.session || state.catalog.user.id !== state.session.userId) throw new Error('Entre e sincronize a carteira antes de organizar visitas.');
      if (!validVisitDate(date)) throw new Error('Informe uma data de visita válida.');
      if (requireCustomer && !getVisitCustomers(state.catalog).some(customer => customer.id === customerId)) throw new Error('Loja não encontrada na carteira.');
    };
    const canSync = () => get().online && !!get().session?.token && !get().authRequired;
    return {
      hydrated: false, online: true, session: null, catalog: emptyCatalog,
      orders: [], tracked: [], notices: [], orderUpdates: [], visits: [], syncing: false, authRequired: false,
      addVisit(customerId, date) {
        validateVisit(customerId, date);
        if (!get().visits.some(visit => visit.customerId === customerId && visit.date === date)) set({ visits: [...get().visits, { customerId, date }] });
      },
      removeVisit(customerId, date) {
        validateVisit(customerId, date, false);
        set({ visits: get().visits.filter(visit => visit.customerId !== customerId || visit.date !== date) });
      },
      setVisitCompleted(customerId, date, completed) {
        validateVisit(customerId, date);
        if (!get().visits.some(visit => visit.customerId === customerId && visit.date === date)) throw new Error('Adicione a loja à agenda antes de concluir a visita.');
        set({ visits: get().visits.map(visit => visit.customerId === customerId && visit.date === date ? { ...visit, completedAt: completed ? visit.completedAt ?? new Date().toISOString() : undefined } : visit) });
      },
      markOrderUpdateRead(key) { set({ orderUpdates: get().orderUpdates.map(update => update.key === key ? { ...update, readFingerprint: update.fingerprint } : update) }); },
      reviewOrderUpdate(key) { set({ orderUpdates: get().orderUpdates.map(update => update.key === key ? { ...update, reviewedFingerprint: update.fingerprint, readFingerprint: update.fingerprint } : update) }); },
      markAllOrderUpdatesRead() { set({ orderUpdates: get().orderUpdates.map(update => isAttention(update) ? update : ({ ...update, readFingerprint: update.fingerprint })) }); },
      async login(login, password) {
        const epoch = ++generation;
        set({ syncing: true, syncError: undefined });
        try {
          const session = await client.login(login, password);
          if (epoch !== generation) return;
          // Hide any previous account before loading authenticated data.
          const same = get().ownerId === session.userId;
          set({ session, authRequired: false, ...(same ? {} : {
            ownerId: session.userId, catalog: emptyCatalog, orders: [], tracked: [], notices: [], orderUpdates: [], visits: [], lastSync: undefined,
          }) });
          const [catalog, tracked] = await Promise.all([client.getBootstrap(), client.listOrders()]);
          if (epoch !== generation) return;
          if (catalog.user.id !== session.userId) throw new Error('Carteira recebida pertence a outro usuário.');
          set({ catalog, tracked, lastSync: new Date().toISOString(), syncError: undefined });
        } catch (error) {
          if (epoch === generation) { fail(error); set({ session: null }); }
          throw error;
        } finally { if (epoch === generation) set({ syncing: false }); }
      },
      logout() {
        generation++;
        // Retain same-account drafts for reauthentication; routes are guarded while signed out.
        set({ session: null, authRequired: false, syncing: false, syncError: undefined,
          orders: get().orders.map(order => order.queueStatus === 'sending' ? { ...order, queueStatus: 'failed', deliveryUncertain: true } : order) });
      },
      setOnline(online) {
        const reconnect = !get().online && online;
        set({ online });
        if (reconnect && canSync()) void get().flush();
      },
      createDraft(customerId, tableId, customerName) {
        const { session, catalog } = get();
        if (!session || catalog.user.id !== session.userId) throw new Error('Entre e sincronize a carteira antes de digitar.');
        const id = `loc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const order: LocalOrder = { id, orderClientId: id, customerId, customerName: customerName ?? catalog.customers.find(item => item.id === customerId)?.name, tableId, userId: session.userId,
          createdAt: new Date().toISOString(), distributorIds: [], prazos: {}, lines: [], localStatus: 7 };
        set({ orders: [order, ...get().orders] });
        return id;
      },
      updateDraft(id, patch) {
        set({ orders: get().orders.map(order => order.id !== id || order.queueStatus === 'sending' || order.queueStatus === 'sent' || order.deliveryUncertain
          ? order : { ...order, ...patch, ...(order.queueStatus === 'failed' ? { queueStatus: undefined, lastError: undefined } : {}), id: order.id, orderClientId: order.orderClientId, userId: order.userId }) });
      },
      enqueue(id) {
        set({ orders: get().orders.map(order => order.id === id && order.queueStatus !== 'sent' && order.queueStatus !== 'sending'
          ? { ...order, queueStatus: 'pending', lastError: undefined } : order) });
        if (canSync()) void get().flush();
      },
      retryUncertain(id) {
        set({ orders: get().orders.map(order => order.id === id && order.deliveryUncertain && !order.remoteId
          ? { ...order, retryAuthorized: true, queueStatus: 'pending' } : order) });
        if (canSync()) void get().flush();
      },
      async flush() {
        if (!canSync() || flushing) return;
        const snapshot = get().orders.filter(order => order.userId === get().session?.userId &&
          (order.queueStatus === 'pending' || order.queueStatus === 'failed') &&
          (apiConfig.protocol !== 'legacy' || !order.deliveryUncertain || (order.retryAuthorized && !order.remoteId)));
        if (!snapshot.length) return;
        const epoch = generation;
        flushing = true;
        const ids = new Set(snapshot.map(order => order.id));
        set({ orders: get().orders.map(order => ids.has(order.id) ? { ...order, queueStatus: 'sending' } : order), syncError: undefined });
        try {
          const flushed = await flushQueue(snapshot, client, order => {
            const customer = get().catalog.customers.find(item => item.id === order.customerId);
            return order.distributorIds.map((id, index) => {
              const distributor = customer?.distributors.find(item => item.id === id);
              if (!distributor) throw new Error('Distribuidor não encontrado no cache. Sincronize a carteira.');
              const prazo = order.prazos[id] ?? distributor.prazos[0];
              return { id_distribuidor: id, prioridade: index + 1, tipo_envio: distributor.tipoEnvio, prazo,
                codigo_faturamento: distributor.codigoFaturamentoPorPrazo?.[prazo] };
            });
          }, { shouldContinue: () => epoch === generation && canSync(), onError: error => { if (epoch === generation) fail(error); },
            preparePayload: (order, payload) => {
              const table = get().catalog.tables.find(item => item.id === order.tableId);
              if (!table) throw new Error('Condição comercial ausente. Sincronize a carteira.');
              const coupon = get().catalog.coupons.find(item => item.code === order.couponCode);
              const quote = quoteOrder(table, order.lines, coupon);
              return { ...payload, array_produtos: payload.array_produtos.map(item => ({ ...item,
                desconto: quote.lines.find(line => line.ean === item.ean)?.discountPercent ?? 0 })) };
            },
            onSending: sending => { if (epoch === generation) set({ orders: get().orders.map(order => order.id === sending.id ? { ...sending, retryAuthorized: false } : order) }); } });
          if (epoch !== generation) return;
          const byId = new Map(flushed.map(order => [order.id, order]));
          set({ orders: get().orders.map(order => byId.get(order.id) ?? order),
            syncError: flushed.find(order => order.queueStatus === 'failed')?.lastError });
          await get().refreshTracked();
        } catch (error) { if (epoch === generation) fail(error); }
        finally {
          flushing = false;
          if (epoch === generation) set({ orders: get().orders.map(order => ids.has(order.id) && order.queueStatus === 'sending'
            ? { ...order, queueStatus: 'failed', deliveryUncertain: true, lastError: 'Envio interrompido. Atualize para tentar novamente.' } : order) });
          if (epoch === generation && get().orders.some(order => !ids.has(order.id) && order.queueStatus === 'pending')) void get().flush();
        }
      },
      async refreshTracked() {
        if (!canSync()) return;
        const epoch = generation;
        try {
          for (const order of get().orders.filter(item => item.deliveryUncertain && item.remoteId)) {
            if (epoch !== generation || !canSync()) return;
            if (client.getOrderStatus) {
              const result = await client.getOrderStatus(order.remoteId!);
              if (epoch !== generation) return;
              if (!result.erros_envio.length && result.id_pedido_gerado > 0) set({ orders: get().orders.map(item => item.id === order.id
                ? { ...item, queueStatus: 'sent', deliveryUncertain: false, lastError: undefined } : item) });
            }
          }
          const tracked = await client.listOrders();
          if (epoch !== generation) return;
          const at = new Date().toISOString();
          const notices = tracked.filter(order => order.status === 1 && get().tracked.some(old => old.id === order.id && old.status !== 1))
            .map(order => acceptanceNotice({ orderId: order.id, distributorName: order.subOrders[0]?.distributorName ?? 'Distribuidor', at }));
          const orders = get().orders.map(order => {
            const remote = tracked.find(item => item.orderClientId === order.orderClientId);
            return remote && order.queueStatus !== 'sending' ? { ...order, queueStatus: 'sent' as const, remoteId: remote.id,
              deliveryUncertain: false, lastError: undefined } : order;
          });
          set({ tracked, orders, syncError: orders.find(order => order.queueStatus === 'failed')?.lastError, notices: [...notices, ...get().notices].slice(0, 50), lastSync: at });
        } catch (error) { if (epoch === generation) fail(error); }
      },
      async pullUpdates() {
        if (!canSync() || get().syncing) return;
        const epoch = generation;
        set({ syncing: true, syncError: undefined });
        try {
          if (client.refreshSession) {
            const session = await client.refreshSession();
            if (epoch !== generation) return;
            set({ session });
          }
          const catalog = await client.getBootstrap();
          if (epoch !== generation) return;
          if (catalog.user.id !== get().session?.userId) throw new Error('Carteira recebida pertence a outro usuário.');
          set({ catalog });
          await get().flush();
          await get().refreshTracked();
        } catch (error) { if (epoch === generation) fail(error); }
        finally { if (epoch === generation) set({ syncing: false }); }
      },
    };
  }, {
    name: `forca-vendas-v5-${apiConfig.mode}-${apiConfig.protocol}-${apiConfig.baseUrl}`,
    storage: createJSONStorage(() => storage),
    partialize: state => ({ session: state.session, ownerId: state.ownerId, catalog: state.catalog,
      orders: state.orders, tracked: state.tracked, notices: state.notices, orderUpdates: state.orderUpdates, visits: state.visits, lastSync: state.lastSync }),
    onRehydrateStorage: () => (state, error) => {
      if (error) queueMicrotask(() => store.setState({ hydrated: true, session: null, syncError: 'Não foi possível carregar a sessão local. Entre novamente.' }));
      if (state) {
        state.orders = state.orders.map(order => order.queueStatus === 'sending' ? { ...order, queueStatus: 'failed', deliveryUncertain: true } : order);
        state.orderUpdates = reconcileOrderUpdates(state.orderUpdates ?? [], state.tracked, state.orders, state.lastSync ?? new Date().toISOString(), true);
        state.visits = Array.isArray(state.visits) ? state.visits.filter(visit => Number.isInteger(visit.customerId) && validVisitDate(visit.date)) : [];
        state.authRequired = !!state.session && !state.session.token;
        state.hydrated = true;
      }
    },
  }));
  return store;
}

export const useAppStore = createAppStore(appStorage);
