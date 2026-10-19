import type { CommercialTable, Coupon, Customer, LocalOrder, ValidationIssue } from './types';
import { validateDistributorSelection } from './order-distributors';
import { quoteOrder } from './pricing';
import { splitLines } from './schedule';
import { validateOrder } from './validation';

export function reviewOrder(input: { order: LocalOrder; table: CommercialTable; customer: Customer; coupon?: Coupon; now?: Date }) {
  const { order, table, customer, coupon, now = new Date() } = input;
  const quote = quoteOrder(table, order.lines, coupon);
  const issues: ValidationIssue[] = validateOrder({ table, customer, lines: order.lines, coupon, now });
  issues.push(...validateDistributorSelection({ selected: order.distributorIds ?? [], prazos: order.prazos ?? {}, released: customer.distributors }));
  if (order.couponCode && !coupon) issues.push({ code: 'COUPON', message: 'Cupom não confirmado. Remova para enviar.', blocking: true });
  const dates = order.scheduleDates ?? [];
  if (dates.length > 1 && !table.dividePedido) issues.push({ code: 'SPLIT', message: 'Esta condição envia em uma data só.', blocking: true });
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  dates.forEach((date, index) => {
    const parsed = new Date(`${date}T12:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date < today) {
      issues.push({ code: `DATE_${index}`, message: 'Use uma data válida a partir de hoje no formato AAAA-MM-DD.', blocking: true });
    }
  });
  if (new Set(dates).size !== dates.length) issues.push({ code: 'DUPLICATE_DATE', message: 'Escolha datas diferentes para dividir o envio.', blocking: true });
  const scheduled = dates.length ? splitLines(table, order.lines, dates.length).map((lines, index) => ({ date: dates[index], lines })) : [];
  if (scheduled.some(part => part.lines.length === 0)) issues.push({ code: 'EMPTY_SCHEDULE', message: 'Quantidade insuficiente para todas as datas de envio.', blocking: true });
  const month = table.monthBilledNet ?? 0;
  const current = table.minValueBasis === 'GROSS' ? quote.gross : quote.net;
  return { quote, issues, scheduled, month, minLeft: Math.max(0, table.minValue - current - month), canSubmit: !issues.some(issue => issue.blocking) };
}
