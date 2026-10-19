import type { StatusNotice } from './types';

export function acceptanceNotice(input: {
  orderId: number;
  distributorName: string;
  at: string;
}): StatusNotice {
  return {
    id: `aceite-${input.orderId}-${input.at}`,
    orderId: input.orderId,
    text: `${input.distributorName} aceitou o pedido ${input.orderId}.`,
    at: input.at,
  };
}
