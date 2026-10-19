import { describe, expect, it } from 'vitest';
import { getOrderProgress, ORDER_PROGRESS_LABELS } from './order-progress';
import type { SubOrder, TrackedOrder } from './types';

function sub(changes: Partial<SubOrder> = {}): SubOrder {
  return {
    id: 1001,
    distributorName: 'OPL',
    status: 1,
    prazo: 28,
    items: [
      {
        ean: '123',
        name: 'Produto',
        unitPrice: 10,
        discountPercent: 0,
        quantPed: 10,
        quantEsp: 10,
        quantNot: 0,
      },
    ],
    ...changes,
  };
}
function order(changes: Partial<TrackedOrder> = {}): TrackedOrder {
  return {
    id: 100,
    orderClientId: 'mobile-100',
    customerName: 'PDV',
    tableName: 'Regular',
    status: 1,
    prazo: 28,
    createdAt: '2026-10-17T10:00:00Z',
    subOrders: [sub()],
    ...changes,
  };
}
const invoice = { number: 'NF-123', value: 100, issuedAt: '2026-10-17' };
function billed(changes: Partial<SubOrder> = {}) {
  const s = sub();
  return sub({ invoice, items: s.items.map((i) => ({ ...i, quantNot: 10 })), ...changes });
}

describe('progresso do pedido por evidências atuais', () => {
  it('mantém os seis rótulos exigidos e não trata aceite como faturamento', () => {
    const progress = getOrderProgress(order());
    expect(progress.steps.map((s) => s.label)).toEqual([
      'Pedido criado',
      'Enviado ao distribuidor',
      'Aguardando resposta',
      'Retorno recebido',
      'Aguardando nota',
      'Pedido faturado',
    ]);
    expect(progress.currentIndex).toBe(4);
    expect(progress.completed).toBe(false);
    expect(progress.steps[5].state).toBe('upcoming');
    expect(progress.steps[4].state).toBe('current');
    expect(ORDER_PROGRESS_LABELS).toHaveLength(6);
  });

  it.each([3, 7, 9, 13, 14])(
    'mantém status %s antes do despacho sem histórico inventado',
    (status) => {
      expect(
        getOrderProgress(order({ status, subOrders: [sub({ status, items: [] })] })),
      ).toMatchObject({ currentIndex: 0, completed: false });
    },
  );

  it('diferencia envio em processamento e espera por resposta', () => {
    expect(
      getOrderProgress(order({ status: 2, subOrders: [sub({ status: 2, items: [] })] }))
        .currentIndex,
    ).toBe(1);
    expect(
      getOrderProgress(order({ status: 4, subOrders: [sub({ status: 4, items: [] })] }))
        .currentIndex,
    ).toBe(2);
  });

  it('aceite sem quantidade de atendimento fica no retorno recebido', () => {
    const s = sub();
    expect(
      getOrderProgress(
        order({
          status: 5,
          subOrders: [sub({ items: s.items.map((i) => ({ ...i, quantEsp: 0 })) })],
        }),
      ),
    ).toMatchObject({ currentIndex: 3, completed: false });
  });

  it('exige nota e quantidades faturadas de todo o atendimento', () => {
    expect(getOrderProgress(order({ subOrders: [billed()] }))).toMatchObject({
      currentIndex: 5,
      completed: true,
      severity: 'success',
    });
    expect(
      getOrderProgress(order({ subOrders: [billed()] })).steps.every(
        (s) => s.state === 'completed',
      ),
    ).toBe(true);
    expect(getOrderProgress(order({ subOrders: [billed({ invoice: undefined })] }))).toMatchObject({
      currentIndex: 4,
      completed: false,
    });
    expect(getOrderProgress(order({ subOrders: [billed(), sub({ id: 1002 })] }))).toMatchObject({
      currentIndex: 4,
      completed: false,
    });
  });

  it('NF parcial não conclui, inclusive sem quantidade prevista informada', () => {
    const partial = sub({ invoice, items: sub().items.map((i) => ({ ...i, quantNot: 5 })) });
    expect(getOrderProgress(order({ subOrders: [partial] })).completed).toBe(false);
    partial.items[0].quantEsp = 0;
    expect(getOrderProgress(order({ subOrders: [partial] })).completed).toBe(false);
  });

  it('NF completa sem previsão informada não inventa unidades faltantes', () => {
    const invoicedWithoutExpected = billed({
      items: sub().items.map((i) => ({ ...i, quantEsp: 0, quantNot: 10 })),
    });
    expect(getOrderProgress(order({ subOrders: [invoicedWithoutExpected] }))).toMatchObject({
      completed: true,
      currentIndex: 5,
      severity: 'success',
    });
    const partialWithoutExpected = billed({
      items: sub().items.map((i) => ({ ...i, quantPed: 20, quantEsp: 0, quantNot: 10 })),
    });
    expect(getOrderProgress(order({ subOrders: [partialWithoutExpected] }))).toMatchObject({
      completed: false,
      currentIndex: 4,
    });
  });

  it('atendimento parcial integralmente faturado conclui com aviso de faltas', () => {
    const partial = sub({
      status: 10,
      invoice,
      items: sub().items.map((i) => ({ ...i, quantEsp: 6, quantNot: 6 })),
    });
    expect(getOrderProgress(order({ status: 10, subOrders: [partial] }))).toMatchObject({
      currentIndex: 5,
      completed: true,
      severity: 'warning',
      note: expect.stringContaining('não atendidas'),
    });
    expect(
      getOrderProgress(order({ status: 10, subOrders: [sub({ status: 10 })] })).currentIndex,
    ).toBe(4);
  });

  it.each([6, 11, 12])(
    'tentativa recusada %s não exige NF se outra OPL atendeu e faturou',
    (status) => {
      const progress = getOrderProgress(
        order({ subOrders: [sub({ status }), billed({ id: 1002 })] }),
      );
      expect(progress).toMatchObject({
        completed: true,
        currentIndex: 5,
        details: { excludedDistributorCount: 1, acceptedQuantity: 10 },
      });
    },
  );

  it('uma NF não encerra a espera por resposta de outra OPL', () => {
    const progress = getOrderProgress(
      order({ subOrders: [billed(), sub({ id: 1002, status: 4, items: [] })] }),
    );
    expect(progress).toMatchObject({
      currentIndex: 2,
      completed: false,
      details: { pendingDistributorCount: 1 },
    });
  });

  it('NF de uma OPL não supre confirmação de quantidades de outra OPL aceita', () => {
    const unconfirmed = sub({
      id: 1002,
      items: sub().items.map((i) => ({ ...i, quantEsp: 0, quantNot: 0 })),
    });
    expect(getOrderProgress(order({ subOrders: [billed(), unconfirmed] }))).toMatchObject({
      completed: false,
      currentIndex: 4,
    });
  });

  it('retorno de todas tentativas recusadas não sugere emissão de nota', () => {
    expect(
      getOrderProgress(order({ subOrders: [sub({ status: 6 }), sub({ id: 1002, status: 11 })] })),
    ).toMatchObject({ currentIndex: 3, completed: false, severity: 'error' });
  });

  it('cancelamento ou recusa com faturamento pede conferência em vez de concluir', () => {
    expect(getOrderProgress(order({ subOrders: [billed({ status: 12 })] }))).toMatchObject({
      currentIndex: 3,
      completed: false,
      severity: 'warning',
    });
  });

  it.each([6, 11, 12, 15, 16])(
    'status terminal/devolução %s não termina com sucesso mesmo com NF',
    (status) => {
      const progress = getOrderProgress(order({ status, subOrders: [billed()] }));
      expect(progress).toMatchObject({ currentIndex: 3, completed: false });
      expect(progress.severity).not.toBe('success');
    },
  );

  it('devolução em subpedido e status desconhecido exigem exceção visível', () => {
    expect(getOrderProgress(order({ subOrders: [billed({ status: 15 })] }))).toMatchObject({
      currentIndex: 3,
      completed: false,
      severity: 'warning',
    });
    expect(getOrderProgress(order({ status: 999 }))).toMatchObject({
      completed: false,
      severity: 'warning',
    });
  });

  it.each([11, 12, 999])('status %s sem subpedidos não inventa despacho ou retorno', (status) => {
    expect(getOrderProgress(order({ status, subOrders: [] }))).toMatchObject({
      currentIndex: 0,
      completed: false,
    });
  });

  it('pedido sem subpedidos ou notas não conclui e não altera a entrada', () => {
    expect(getOrderProgress(order({ subOrders: [] }))).toMatchObject({
      currentIndex: 3,
      completed: false,
    });
    const input = order({ subOrders: [billed()] });
    const before = JSON.stringify(input);
    getOrderProgress(input);
    expect(JSON.stringify(input)).toBe(before);
  });
});
