import { router } from 'expo-router';
import type { PdvRef } from '@rules/types';
import { useAppStore } from './store';

/** Always open the selected PDV; incomplete sync is handled in the order screen. */
export function startOrderForPdv(pdv: PdvRef) {
  const { catalog, createDraft } = useAppStore.getState();
  const customer = catalog.customers.find((item) => item.id === pdv.id);
  const tableId =
    customer?.tableIds.find((id) => catalog.tables.some((table) => table.id === id)) ?? 0;
  const id = createDraft(pdv.id, tableId, pdv.name);
  router.push(`/pedido/${id}`);
}
