import type { CommercialTable, OrderLine, OrderQuote, TableProduct } from './types';

export function minimumRemaining(table: CommercialTable, quote: OrderQuote) {
  const current = table.minValueBasis === 'GROSS' ? quote.gross : quote.net;
  return Math.max(0, table.minValue - current - (table.monthBilledNet ?? 0));
}

export function productPresentation(table: CommercialTable, product: TableProduct, lines: OrderLine[]) {
  const quantity = lines.find(line => line.ean === product.ean)?.quantity ?? 0;
  const tiers = [...product.tiers].sort((a, b) => a.quantMin - b.quantMin);
  const next = tiers.find(tier => quantity < tier.quantMin);
  const tierMessage = next
    ? quantity === 0 ? `Peça ${next.quantMin} un para +${next.percent}%` : `Faltam ${next.quantMin - quantity} un para +${next.percent}%`
    : tiers.length ? `Faixa máxima · +${tiers[tiers.length - 1].percent}%` : 'Sem faixa progressiva';
  const mechanics: string[] = [];
  for (const rule of table.triggers) {
    if (rule.triggerEan === product.ean) {
      const child = table.products.find(item => item.ean === rule.childEan);
      const left = rule.threshold - quantity;
      mechanics.push(`Gatilho: a partir de ${rule.threshold} un, +${rule.extraPercent}% em ${child?.name ?? rule.childEan}${left > 0 ? ` · faltam ${left} un` : ' · ativo'}`);
    }
    if (rule.childEan === product.ean) {
      const parent = table.products.find(item => item.ean === rule.triggerEan);
      const parentQuantity = lines.find(line => line.ean === rule.triggerEan)?.quantity ?? 0;
      const left = rule.threshold - parentQuantity;
      mechanics.push(`Gatilho: +${rule.extraPercent}% com ${rule.threshold} un de ${parent?.name ?? rule.triggerEan}${left > 0 ? ` · faltam ${left} un` : ' · ativo'}`);
    }
  }
  if (product.ceilingDiscount != null) mechanics.push(`Teto ${product.ceilingDiscount}%. O desconto não passa disso.`);
  if (product.required === 'required') mechanics.push('Obrigatório nesta condição.');
  mechanics.push(`De ${product.packSize} em ${product.packSize} · mínimo ${product.minQty} un${product.maxQty ? ` · máximo ${product.maxQty} un` : ''}`);
  return { tierMessage, mechanics, tiers: tiers.slice(0, 5).map(tier => ({ ...tier, reached: quantity >= tier.quantMin, focus: next?.quantMin === tier.quantMin })) };
}
