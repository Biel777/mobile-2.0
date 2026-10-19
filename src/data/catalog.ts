import type { BootstrapData } from '@tradetools/client';

export const emptyCatalog: BootstrapData = {
  user: { id: 0, name: '', login: '', area: '', bloqueiaNegociado: true },
  customers: [], tables: [], coupons: [], flags: [],
  goals: { periodLabel: 'Sem sincronização', metaValor: 0, realizadoValor: 0, metaQtd: 0,
    realizadoQtd: 0, pdvsCarteira: 0, pdvsPositivados: 0, pdvsSemPositivar: [], families: [] },
};
