import { isPortfolioCustomer } from './portfolio';
import { comboShare, findProduct, quoteOrder } from './pricing';
import type {
  CommercialTable,
  Coupon,
  Customer,
  OrderLine,
  ValidationIssue,
} from './types';

export function validateLine(
  table: CommercialTable,
  ean: string,
  quantity: number,
): ValidationIssue[] {
  const product = findProduct(table, ean);
  if (!product) {
    return [{ code: 'NOT_ON_TABLE', message: 'Produto fora da condição comercial.', blocking: true }];
  }

  const issues: ValidationIssue[] = [];
  if (quantity <= 0) {
    issues.push({ code: 'QTY', message: `${product.name}: quantidade deve ser maior que zero.`, blocking: true });
    return issues;
  }
  if (quantity % product.packSize !== 0) {
    issues.push({
      code: 'PACK',
      message: `${product.name}: quantidade deve ser múltiplo de ${product.packSize}.`,
      blocking: true,
    });
  }
  if (quantity < product.minQty) {
    issues.push({
      code: 'MIN_QTY',
      message: `${product.name}: mínimo de ${product.minQty} unidades.`,
      blocking: true,
    });
  }
  if (product.maxQty != null && quantity > product.maxQty) {
    issues.push({
      code: 'MAX_QTY',
      message: `${product.name}: máximo de ${product.maxQty} unidades.`,
      blocking: true,
    });
  }
  return issues;
}

export function validateOrder(input: {
  table: CommercialTable;
  customer: Customer;
  lines: OrderLine[];
  coupon?: Coupon;
  now?: Date;
}): ValidationIssue[] {
  const { table, customer, lines, coupon, now = new Date() } = input;
  const issues: ValidationIssue[] = [];

  if (!isPortfolioCustomer(customer)) {
    issues.push({
      code: 'NO_AREA',
      message: 'PDV sem área Legacy cadastrada.',
      blocking: true,
    });
  }

  if (!customer.tableIds.includes(table.id)) {
    issues.push({
      code: 'TABLE_NOT_RELEASED',
      message: 'Tabela não está liberada para o cliente.',
      blocking: true,
    });
  }

  if (new Date(table.expiresAt) < now) {
    issues.push({ code: 'EXPIRED', message: 'Condição comercial vencida.', blocking: true });
  }

  if (customer.distributors.length === 0) {
    issues.push({ code: 'NO_OPL', message: 'Pedido sem distribuidor na ordem de envio.', blocking: true });
  }

  const active = lines.filter((line) => line.quantity > 0);
  if (active.length === 0) {
    issues.push({ code: 'EMPTY', message: 'Inclua ao menos um produto.', blocking: true });
  }

  for (const line of active) {
    issues.push(...validateLine(table, line.ean, line.quantity));
  }

  for (const product of table.products.filter((item) => item.required === 'required')) {
    const qty = active.find((line) => line.ean === product.ean)?.quantity ?? 0;
    if (qty < product.minQty) {
      issues.push({
        code: 'REQUIRED',
        message: `${product.name} é obrigatório nesta tabela.`,
        blocking: true,
      });
    }
  }

  const quote = quoteOrder(table, active, coupon);
  const month = table.monthBilledNet ?? 0;
  const current = table.minValueBasis === 'GROSS' ? quote.gross : quote.net;
  const comparable = current + month;
  if (table.minValue > 0 && comparable < table.minValue) {
    const missing = (table.minValue - comparable).toFixed(2);
    const credited = month > 0 ? ` Já faturado no mês: R$ ${month.toFixed(2)}.` : '';
    issues.push({
      code: 'MIN_VALUE',
      message: `Faltam R$ ${missing} para o valor mínimo da tabela.${credited}`,
      blocking: true,
    });
  }

  if (table.comboParticipation != null) {
    const share = comboShare(table, quote);
    if (share < table.comboParticipation) {
      issues.push({
        code: 'COMBO',
        message: `Participação do combo em ${share}% (mínimo ${table.comboParticipation}%).`,
        blocking: true,
      });
    }
  }

  if (coupon && quote.net < coupon.minNet) {
    issues.push({
      code: 'COUPON_MIN',
      message: 'Cupom abaixo do checkout mínimo — será revalidado no envio.',
      blocking: false,
    });
  }

  quote.warnings.forEach((message) => {
    if (!issues.some((issue) => issue.message === message)) {
      issues.push({ code: 'WARN', message, blocking: false });
    }
  });

  return issues;
}

export function canSubmit(issues: ValidationIssue[]): boolean {
  return !issues.some((issue) => issue.blocking);
}
