import type {
  CommercialTable,
  Coupon,
  Customer,
  FlagGoal,
  Goals,
  SubmitOrderPayload,
  SubmitOrderResult,
  TrackedOrder,
} from '@rules/types';

export type Session = {
  token: string;
  userId: number;
  name: string;
  login?: string;
  codigoSincronizacao?: string;
  imei?: string;
  versao?: string;
};

/** Contrato normalizado do gateway mobile; não representa endpoints legados confirmados. */
export type BootstrapData = {
  user: { id: number; name: string; login: string; area: string; bloqueiaNegociado: boolean };
  customers: Customer[];
  tables: CommercialTable[];
  coupons: Coupon[];
  goals: Goals;
  flags: FlagGoal[];
  integrationWarnings?: string[];
  unsupportedFeatures?: ('coupons' | 'flags')[];
};

export type SalesApiClient = {
  login(login: string, password: string): Promise<Session>;
  refreshSession?(): Promise<Session>;
  getOrderStatus?(id: number): Promise<SubmitOrderResult>;
  getBootstrap(): Promise<BootstrapData>;
  submitOrder(payload: SubmitOrderPayload): Promise<SubmitOrderResult>;
  listOrders(): Promise<TrackedOrder[]>;
  getGoals(): Promise<Goals>;
};
