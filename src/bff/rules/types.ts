export type Requirement = 'none' | 'basket' | 'required';
export type MinBasis = 'NET' | 'GROSS';
export type QueueStatus = 'pending' | 'sending' | 'sent' | 'failed';

export type DiscountTier = {
  quantMin: number;
  percent: number;
};

export type TriggerRule = {
  triggerEan: string;
  threshold: number;
  childEan: string;
  extraPercent: number;
};

export type TableProduct = {
  ean: string;
  name: string;
  family?: string;
  listPrice: number;
  baseDiscount: number;
  minQty: number;
  maxQty?: number;
  packSize: number;
  required: Requirement;
  isCombo?: boolean;
  ceilingDiscount?: number;
  /** Embalagem que não pode ser fotografada. A tela usa a caixa padrão. */
  photoRestricted?: boolean;
  tiers: DiscountTier[];
};

export type CommercialTable = {
  id: number;
  name: string;
  minValue: number;
  minValueBasis: MinBasis;
  comboParticipation?: number;
  /** Soma já faturada no mês. Entra no mínimo, sem mudar a faixa de desconto. */
  monthBilledNet?: number;
  /** Permite partir o pedido em mais de uma data. */
  dividePedido?: boolean;
  expiresAt: string;
  onlyMobile: boolean;
  products: TableProduct[];
  priceContexts?: { customerId: number; distributorId: number; products: TableProduct[] }[];
  triggers: TriggerRule[];
};

export const MAX_DISTRIBUTORS = 6;

export type Distributor = {
  id: number;
  name: string;
  priority: number;
  tipoEnvio: 1 | 2;
  /** Prazos de pagamento que este distribuidor aceita, em dias. */
  prazos: number[];
  /** Código explícito do tenant para cada prazo; não inferir do ID do OPL. */
  codigoFaturamentoPorPrazo?: Record<number, string>;
};

export type Customer = {
  id: number;
  name: string;
  cnpj: string;
  city: string;
  areaId: number;
  hasSalesArea: boolean;
  tableIds: number[];
  distributors: Distributor[];
};

export type Coupon = {
  code: string;
  percent: number;
  minNet: number;
};

export type OrderLine = {
  ean: string;
  quantity: number;
};

export type LineQuote = {
  ean: string;
  name: string;
  quantity: number;
  listPrice: number;
  discountPercent: number;
  gross: number;
  net: number;
  badges: string[];
};

export type OrderQuote = {
  lines: LineQuote[];
  gross: number;
  net: number;
  discountValue: number;
  warnings: string[];
};

export type ValidationIssue = {
  code: string;
  message: string;
  blocking: boolean;
};

export type LocalOrder = {
  id: string;
  orderClientId: string;
  customerId: number;
  customerName?: string;
  tableId: number;
  userId: number;
  createdAt: string;
  lines: OrderLine[];
  /** Ordem de envio, prioridade = posição. Máximo de 6. */
  distributorIds: number[];
  /** Prazo escolhido por distribuidor (id → dias). */
  prazos: Record<number, number>;
  /** Datas de envio. Vazio significa enviar agora. */
  scheduleDates?: string[];
  couponCode?: string;
  customerOrderCode?: string;
  justificativa?: string;
  localStatus: 7 | 3 | 4 | 9;
  queueStatus?: QueueStatus;
  remoteId?: number;
  lastError?: string;
  deliveryUncertain?: boolean;
  retryAuthorized?: boolean;
  submissionPayload?: SubmitOrderPayload;
};

export type TrackedItem = {
  ean: string;
  name: string;
  unitPrice: number;
  discountPercent: number;
  quantPed: number;
  quantEsp: number;
  quantNot: number;
  reason?: string;
};

export type SubOrder = {
  id: number;
  distributorName: string;
  status: number;
  prazo: number;
  items: TrackedItem[];
  invoice?: {
    number: string;
    value: number;
    issuedAt: string;
  };
};

export type TrackedOrder = {
  id: number;
  customerId?: number;
  customerCnpj?: string;
  orderClientId: string;
  customerName: string;
  tableName: string;
  status: number;
  prazo: number;
  dataEnvio?: string;
  createdAt: string;
  subOrders: SubOrder[];
};

export type PdvRef = {
  id: number;
  name: string;
  city: string;
};

export type FamilyCoverage = {
  family: string;
  metaPdvs: number;
  faturados: number;
  semPositivar: PdvRef[];
};

export type Goals = {
  periodLabel: string;
  metaValor: number;
  realizadoValor: number;
  metaQtd: number;
  realizadoQtd: number;
  pdvsCarteira: number;
  pdvsPositivados: number;
  pdvsSemPositivar: PdvRef[];
  families: FamilyCoverage[];
};

export type FlagFamilyMin = {
  family: string;
  minNet: number;
  billedNet: number;
};

export type FlagGoal = {
  name: string;
  minNet: number;
  billedNet: number;
  families: FlagFamilyMin[];
};

export type StatusNotice = {
  id: string;
  orderId: number;
  text: string;
  at: string;
};

export type SubmitOrderPayload = {
  order_client_id: string;
  codigo_pedido?: string;
  id_cliente: number;
  id_tabela: number;
  id_usuario: number;
  datahora_criacao: string;
  array_ordem_envio: {
    id_distribuidor: number;
    prioridade: number;
    tipo_envio: 1 | 2;
    prazo: number;
    codigo_faturamento?: string;
  }[];
  array_produtos: { ean: string; quantidade: number; desconto?: number }[];
  array_agendamento?: { data_envio: string }[];
  cupom?: string;
  justificativa?: string;
};

export type SubmitOrderResult = {
  id_pedido_gerado: number;
  id_status: number;
  erros_envio: string[];
};
