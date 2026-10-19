import { emptyCatalog } from './catalog';

import type { AppState, StoreContext } from './store';

export function createSessionActions(
  context: StoreContext,
): Pick<AppState, 'login' | 'logout' | 'setOnline'> {
  const { get, set, canSync, fail, getClient, getGeneration, nextGeneration } = context;
  return {
    async login(login, password) {
      const client = getClient();
      const epoch = nextGeneration();
      const startedAt = new Date().toISOString();
      set({ syncing: true, syncError: undefined });
      try {
        const session = await client.login(login, password);
        if (epoch !== getGeneration()) return;
        // Hide any previous account before loading authenticated data.
        const same = get().ownerId === session.userId;
        set({
          session,
          authRequired: false,
          ...(same
            ? {}
            : {
                ownerId: session.userId,
                catalog: emptyCatalog,
                orders: [],
                tracked: [],
                notices: [],
                orderUpdates: [],
                visits: [],
                lastSync: undefined,
                lastOrderSync: undefined,
              }),
        });
        const [catalog, tracked] = await Promise.all([client.getBootstrap(), client.listOrders()]);
        if (epoch !== getGeneration()) return;
        if (catalog.user.id !== session.userId)
          throw new Error('Carteira recebida pertence a outro usuário.');
        set({
          catalog,
          tracked,
          lastOrderSync: startedAt,
          lastSync: new Date().toISOString(),
          syncError: undefined,
        });
      } catch (error) {
        if (epoch === getGeneration()) {
          fail(error);
          set({ session: null });
        }
        throw error;
      } finally {
        if (epoch === getGeneration()) set({ syncing: false });
      }
    },
    logout() {
      nextGeneration();
      // Retain same-account drafts for reauthentication; routes are guarded while signed out.
      set({
        session: null,
        authRequired: false,
        syncing: false,
        syncError: undefined,
        orders: get().orders.map((order) =>
          order.queueStatus === 'sending'
            ? { ...order, queueStatus: 'failed', deliveryUncertain: true }
            : order,
        ),
      });
    },
    setOnline(online) {
      const reconnect = !get().online && online;
      set({ online });
      if (reconnect && canSync()) void get().flush();
    },
  };
}
