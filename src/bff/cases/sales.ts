// Stable in-process entry points for offline sales workflows.
export { useAppStore } from '@data/store';
export { startOrderForPdv } from '@data/order-entry';
export { filterPortfolioRefs, isPortfolioCustomer } from '@rules/portfolio';
export { attainment, gap, money, moneyShort, quoteOrder } from '@rules/pricing';
export { canSubmit, validateOrder } from '@rules/validation';
export { validateDistributorSelection } from '@rules/order-distributors';
export { statusLabel } from '@rules/status';
export { getOrderProgress } from '@rules/order-progress';
export { isAttention, isUnread } from '@rules/order-updates';
export { getVisitCustomers, getCustomerOrders, localDateKey } from '@rules/visits';

export { resolveOrderTable } from '@rules/order-context';

export { reviewOrder } from '@rules/order-review';

export { productPresentation, minimumRemaining } from '@rules/product-presentation';
