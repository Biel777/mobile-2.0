import type { AppState, StoreContext } from './store';

export function createVisitsActions(
  context: StoreContext,
): Pick<AppState, 'addVisit' | 'removeVisit' | 'setVisitCompleted'> {
  const { get, set, validateVisit } = context;
  return {
    addVisit(customerId, date) {
      validateVisit(customerId, date);
      if (!get().visits.some((visit) => visit.customerId === customerId && visit.date === date))
        set({ visits: [...get().visits, { customerId, date }] });
    },
    removeVisit(customerId, date) {
      validateVisit(customerId, date, false);
      set({
        visits: get().visits.filter(
          (visit) => visit.customerId !== customerId || visit.date !== date,
        ),
      });
    },
    setVisitCompleted(customerId, date, completed) {
      validateVisit(customerId, date);
      if (!get().visits.some((visit) => visit.customerId === customerId && visit.date === date))
        throw new Error('Adicione a loja à agenda antes de concluir a visita.');
      set({
        visits: get().visits.map((visit) =>
          visit.customerId === customerId && visit.date === date
            ? {
                ...visit,
                completedAt: completed
                  ? (visit.completedAt ?? new Date().toISOString())
                  : undefined,
              }
            : visit,
        ),
      });
    },
  };
}
