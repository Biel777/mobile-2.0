export const ORDER_STATUS: Record<number, string> = {
  1: 'Aceito',
  2: 'Em processamento',
  3: 'Agendado',
  4: 'Aguardando retorno',
  5: 'Confirmado',
  6: 'Recusado pelo distribuidor',
  7: 'Em digitação',
  9: 'Pendente',
  10: 'Parcialmente aceito',
  11: 'Rejeitado',
  12: 'Cancelado',
  13: 'Pendente margem',
  14: 'Aguardando mínimo bandeira',
  15: 'Parcialmente devolvido',
  16: 'Devolvido',
};

export const FATURADO_STATUS = [1, 5, 10];

export function statusLabel(id: number): string {
  return ORDER_STATUS[id] ?? `Status ${id}`;
}

export function isInvoiced(status: number, hasInvoice: boolean): boolean {
  return hasInvoice || FATURADO_STATUS.includes(status);
}
