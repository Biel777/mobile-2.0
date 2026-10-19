import type {
  CommercialTable,
  Coupon,
  LineQuote,
  OrderLine,
  OrderQuote,
  TableProduct,
} from './types';

const DISCOUNT_CAP = 99.99;

export function findProduct(table: CommercialTable, ean: string): TableProduct | undefined {
  return table.products.find((item) => item.ean === ean);
}

export function progressiveExtra(product: TableProduct, quantity: number): number {
  const applicable = product.tiers.filter((tier) => quantity >= tier.quantMin);
  if (applicable.length === 0) {
    return 0;
  }
  return Math.max(...applicable.map((tier) => tier.percent));
}

export function triggerExtra(table: CommercialTable, lines: OrderLine[], ean: string): number {
  return table.triggers.reduce((acc, rule) => {
    if (rule.childEan !== ean) {
      return acc;
    }
    const triggerQty = lines.find((line) => line.ean === rule.triggerEan)?.quantity ?? 0;
    return triggerQty >= rule.threshold ? acc + rule.extraPercent : acc;
  }, 0);
}

export function quoteLine(
  table: CommercialTable,
  lines: OrderLine[],
  ean: string,
  quantity: number,
  coupon?: Coupon,
): LineQuote {
  const product = findProduct(table, ean);
  if (!product || quantity <= 0) {
    return {
      ean,
      name: product?.name ?? ean,
      quantity,
      listPrice: 0,
      discountPercent: 0,
      gross: 0,
      net: 0,
      badges: [],
    };
  }

  const badges: string[] = [];
  let discount = product.baseDiscount;
  const extra = progressiveExtra(product, quantity);
  if (extra > 0) {
    discount += extra;
    badges.push('faixa');
  }

  const trigger = triggerExtra(table, lines, ean);
  if (trigger > 0) {
    discount += trigger;
    badges.push('gatilho');
  }

  if (coupon) {
    discount += coupon.percent;
    badges.push('cupom');
  }

  if (product.ceilingDiscount != null && discount > product.ceilingDiscount) {
    discount = product.ceilingDiscount;
    badges.push('teto');
  }

  discount = Math.min(discount, DISCOUNT_CAP);
  const gross = product.listPrice * quantity;
  const net = Number((gross * (1 - discount / 100)).toFixed(2));

  return {
    ean,
    name: product.name,
    quantity,
    listPrice: product.listPrice,
    discountPercent: Number(discount.toFixed(2)),
    gross: Number(gross.toFixed(2)),
    net,
    badges,
  };
}

export function quoteOrder(
  table: CommercialTable,
  lines: OrderLine[],
  coupon?: Coupon,
): OrderQuote {
  const active = lines.filter((line) => line.quantity > 0);
  const warnings: string[] = [];
  const quoted = active.map((line) => quoteLine(table, active, line.ean, line.quantity, coupon));
  const gross = Number(quoted.reduce((sum, line) => sum + line.gross, 0).toFixed(2));
  const net = Number(quoted.reduce((sum, line) => sum + line.net, 0).toFixed(2));

  if (coupon && net < coupon.minNet) {
    warnings.push('Cupom abaixo do valor mínimo — será revalidado no envio.');
  }

  return {
    lines: quoted,
    gross,
    net,
    discountValue: Number((gross - net).toFixed(2)),
    warnings,
  };
}

export function comboShare(table: CommercialTable, quote: OrderQuote): number {
  if (!table.comboParticipation || quote.net <= 0) {
    return 0;
  }
  const comboNet = quote.lines
    .filter((line) => findProduct(table, line.ean)?.isCombo)
    .reduce((sum, line) => sum + line.net, 0);
  return Number(((comboNet / quote.net) * 100).toFixed(2));
}

export function attainment(meta: number, actual: number): number {
  if (meta <= 0) {
    return 0;
  }
  return Number(((actual / meta) * 100).toFixed(1));
}

export function gap(meta: number, actual: number): number {
  return Number(Math.max(meta - actual, 0).toFixed(2));
}

export function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function moneyShort(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  }
  return money(value);
}
