import { createSessionActions } from './session';
import { createVisitsActions } from './visits';
import { createOrdersActions } from './orders';
import { createCatalogActions } from './catalog-actions';
import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { createSalesApiClient, apiConfig } from '@tradetools/index';
import type { ApiConfig } from '@tradetools/config';
import type { BootstrapData, Session, SalesApiClient } from '@tradetools/client';
import { getVisitCustomers, validVisitDate, type Visit } from '@rules/visits';

import { reconcileOrderUpdates, type OrderUpdate } from '@rules/order-updates';
import type { LocalOrder, StatusNotice, TrackedOrder } from '@rules/types';

import { emptyCatalog } from './catalog';
import { appStorage } from './storage';

export type AppState = {
  hydrated: boolean;
  online: boolean;
  session: Session | null;
  ownerId?: number;
  catalog: BootstrapData;
  orders: LocalOrder[];
  tracked: TrackedOrder[];
  notices: StatusNotice[];
  orderUpdates: OrderUpdate[];
  visits: Visit[];
  addVisit: (customerId: number, date: string) => void;
  removeVisit: (customerId: number, date: string) => void;
  setVisitCompleted: (customerId: number, date: string, completed: boolean) => void;
  lastOrderSync?: string;
  lastSync?: string;
  syncError?: string;
  syncing: boolean;
  authRequired: boolean;
  markOrderUpdateRead: (key: string) => void;
  reviewOrderUpdate: (key: string) => void;
  markAllOrderUpdatesRead: () => void;
  login: (login: string, password: string) => Promise<void>;
  logout: () => void;
  setOnline: (online: boolean) => void;
  createDraft: (customerId: number, tableId: number, customerName?: string) => string;
  updateDraft: (id: string, patch: Partial<LocalOrder>) => void;
  enqueue: (id: string) => void;
  retryUncertain: (id: string) => void;
  flush: () => Promise<void>;
  refreshTracked: () => Promise<void>;
  pullUpdates: () => Promise<void>;
};

export type StoreContext = {
  get: () => AppState;
  set: (patch: Partial<AppState>) => void;
  canSync: () => boolean;
  fail: (error: unknown) => void;
  validateVisit: (customerId: number, date: string, requireCustomer?: boolean) => void;
  getClient: () => SalesApiClient;
  getGeneration: () => number;
  nextGeneration: () => number;
  isFlushing: () => boolean;
  setFlushing: (value: boolean) => void;
  getConfig: () => ApiConfig;
};

export function createAppStore(
  storage: StateStorage,
  suppliedClient?: SalesApiClient,
  skipHydration = false,
) {
  let generation = 0;
  let currentConfig = { ...apiConfig };
  let client: SalesApiClient | undefined = suppliedClient;
  let transportBase = currentConfig.baseUrl;
  const makeClient = () => {
    const ownerConfig = currentConfig;
    const belongs = () => currentConfig === ownerConfig;
    return (
      suppliedClient ??
      createSalesApiClient({
        ...ownerConfig,
        baseUrl: transportBase,
        getLastOrderSync: () => (belongs() ? store.getState().lastOrderSync : undefined),
        getCachedOrders: () => (belongs() ? store.getState().tracked : []),
        getToken: () => (belongs() ? store.getState().session?.token : undefined),
        getSession: () => (belongs() ? store.getState().session : null),
      })
    );
  };
  let flushing = false;
  const store = create<AppState>()(
    persist(
      (rawSet, get) => {
        // Queue failures are observed even when the subsequent list request fails.
        const set = (patch: Partial<AppState>) => {
          const state = get();
          if (patch.orders || patch.tracked) {
            patch.orderUpdates = reconcileOrderUpdates(
              patch.orderUpdates ?? state.orderUpdates ?? [],
              patch.tracked ?? state.tracked,
              patch.orders ?? state.orders,
              new Date().toISOString(),
              !state.lastSync,
            );
          }
          rawSet(patch);
        };
        const fail = (error: unknown) => {
          const code = (error as { code?: string })?.code;
          const message = `${code ? `${code}: ` : ''}${error instanceof Error ? error.message : 'Falha de sincronização'}`;
          const expired = (error as { status?: number })?.status === 401;
          set({ syncError: message, ...(expired ? { authRequired: true } : {}) });
        };
        const validateVisit = (customerId: number, date: string, requireCustomer = true) => {
          const state = get();
          if (!state.session || state.catalog.user.id !== state.session.userId)
            throw new Error('Entre e sincronize a carteira antes de organizar visitas.');
          if (!validVisitDate(date)) throw new Error('Informe uma data de visita válida.');
          if (
            requireCustomer &&
            !getVisitCustomers(state.catalog).some((customer) => customer.id === customerId)
          )
            throw new Error('Loja não encontrada na carteira.');
        };
        const canSync = () => get().online && !!get().session?.token && !get().authRequired;
        const context: StoreContext = {
          get,
          set,
          canSync,
          fail,
          validateVisit,
          getClient: () => (client ??= makeClient()),
          getGeneration: () => generation,
          nextGeneration: () => ++generation,
          isFlushing: () => flushing,
          setFlushing: (value) => {
            flushing = value;
          },
          getConfig: () => currentConfig,
        };
        return {
          hydrated: false,
          online: true,
          session: null,
          catalog: emptyCatalog,
          orders: [],
          tracked: [],
          notices: [],
          orderUpdates: [],
          visits: [],
          syncing: false,
          authRequired: false,
          ...createVisitsActions(context),

          ...createSessionActions(context),

          ...createOrdersActions(context),

          ...createCatalogActions(context),
        };
      },
      {
        name: `forca-vendas-v5-${apiConfig.mode}-${apiConfig.protocol}-${apiConfig.baseUrl}`,
        storage: createJSONStorage(() =>
          skipHydration
            ? { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} }
            : storage,
        ),
        skipHydration,
        partialize: (state) => ({
          session: state.session,
          ownerId: state.ownerId,
          catalog: state.catalog,
          orders: state.orders,
          tracked: state.tracked,
          notices: state.notices,
          orderUpdates: state.orderUpdates,
          visits: state.visits,
          lastSync: state.lastSync,
          lastOrderSync: state.lastOrderSync,
        }),
        onRehydrateStorage: () => (state, error) => {
          if (error)
            queueMicrotask(() =>
              store.setState({
                hydrated: true,
                session: null,
                syncError: 'Não foi possível carregar a sessão local. Entre novamente.',
              }),
            );
          if (state) {
            state.orders = state.orders.map((order) =>
              order.queueStatus === 'sending'
                ? { ...order, queueStatus: 'failed', deliveryUncertain: true }
                : order,
            );
            state.orderUpdates = reconcileOrderUpdates(
              state.orderUpdates ?? [],
              state.tracked,
              state.orders,
              state.lastSync ?? new Date().toISOString(),
              true,
            );
            state.visits = Array.isArray(state.visits)
              ? state.visits.filter(
                  (visit) => Number.isInteger(visit.customerId) && validVisitDate(visit.date),
                )
              : [];
            state.authRequired = !!state.session && !state.session.token;
            state.hydrated = true;
          }
        },
      },
    ),
  );
  return Object.assign(store, {
    async configure(
      config: ApiConfig,
      nextStorage: StateStorage,
      baseUrl = config.baseUrl,
      restoreSession = false,
    ) {
      // Invalidate in-flight requests before changing account/tenant boundaries.
      if (restoreSession) generation++;
      else store.getState().logout();
      const name = `forca-vendas-v5-${config.mode}-${config.protocol}-${config.baseUrl}`;
      const raw = await nextStorage.getItem(name);
      const cached = raw ? JSON.parse(raw).state : {};
      currentConfig = { ...config };
      transportBase = baseUrl;
      client = makeClient();
      store.persist.setOptions({ name, storage: createJSONStorage(() => nextStorage) });
      store.setState({
        catalog: cached.catalog ?? emptyCatalog,
        ownerId: cached.ownerId,
        orders: (cached.orders ?? []).map((order: LocalOrder) =>
          order.queueStatus === 'sending'
            ? { ...order, queueStatus: 'failed', deliveryUncertain: true }
            : order,
        ),
        tracked: cached.tracked ?? [],
        notices: cached.notices ?? [],
        orderUpdates: cached.orderUpdates ?? [],
        visits: cached.visits ?? [],
        lastSync: cached.lastSync,
        lastOrderSync: cached.lastOrderSync,
        session: restoreSession ? (cached.session ?? null) : null,
        authRequired: restoreSession && !!cached.session && !cached.session.token,
        syncing: false,
        syncError: undefined,
        hydrated: true,
      });
    },
  });
}

export const useAppStore = createAppStore(appStorage, undefined, true);
