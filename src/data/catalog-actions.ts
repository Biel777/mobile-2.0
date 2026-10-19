










import type { AppState, StoreContext } from './store';

export function createCatalogActions(context: StoreContext): Pick<AppState, "pullUpdates"> {
  const { get, set, canSync, fail, getClient, getGeneration } = context;
  return {
async pullUpdates() {
 const client = getClient();
        if (!canSync() || get().syncing) return;
        const epoch = getGeneration();
        set({ syncing: true, syncError: undefined });
        try {
          if (client.refreshSession) {
            const session = await client.refreshSession();
            if (epoch !== getGeneration()) return;
            set({ session });
          }
          const catalog = await client.getBootstrap();
          if (epoch !== getGeneration()) return;
          if (catalog.user.id !== get().session?.userId) throw new Error('Carteira recebida pertence a outro usuário.');
          set({ catalog });
          await get().flush();
          await get().refreshTracked();
        } catch (error) { if (epoch === getGeneration()) fail(error); }
        finally { if (epoch === getGeneration()) set({ syncing: false }); }
      }
  };
}
