import { fixtures } from '@data/fixtures';
import { quoteOrder } from '@rules/pricing';
import { promoteIfDue, splitLines } from '@rules/schedule';
import { canSubmit, validateOrder } from '@rules/validation';
import type { SubmitOrderPayload, SubmitOrderResult, TrackedOrder } from '@rules/types';
import type { SalesApiClient } from './client';

export function createMockClient() {
  const sent = new Map<string, SubmitOrderResult>();
  const remote: TrackedOrder[] = JSON.parse(JSON.stringify(fixtures.tracked));
  let nextId = 9000;

  const client: SalesApiClient = {
    async login(login: string, password: string) {
      if (!login || password.length < 3) {
        throw new Error('Credenciais inválidas');
      }
      return { token: 'demo-token', userId: fixtures.user.id, name: fixtures.user.name };
    },

    async submitOrder(payload: SubmitOrderPayload): Promise<SubmitOrderResult> {
      const existing = sent.get(payload.order_client_id);
      if (existing) {
        return existing;
      }

      const customer = fixtures.customers.find((item) => item.id === payload.id_cliente);
      const table = fixtures.tables.find((item) => item.id === payload.id_tabela);
      if (!customer || !table) {
        return { id_pedido_gerado: 0, id_status: 7, erros_envio: ['PDV ou tabela inválidos'] };
      }

      const lines = payload.array_produtos.map((item) => ({
        ean: item.ean,
        quantity: item.quantidade,
      }));
      const coupon = fixtures.coupons.find((item) => item.code === payload.cupom);
      const issues = validateOrder({ table, customer, lines, coupon });
      if (!canSubmit(issues)) {
        return {
          id_pedido_gerado: 0,
          id_status: 7,
          erros_envio: issues.filter((issue) => issue.blocking).map((issue) => issue.message),
        };
      }

      const dates = payload.array_agendamento?.map((item) => item.data_envio) ?? [];
      if (dates.length > 1 && !table.dividePedido) {
        return {
          id_pedido_gerado: 0,
          id_status: 7,
          erros_envio: ['Esta condição não divide o pedido por data.'],
        };
      }
      const parts = dates.length > 1 ? splitLines(table, lines, dates.length) : [lines];
      const status = dates.length > 0 ? 3 : 4;
      const id = nextId++;
      const result: SubmitOrderResult = {
        id_pedido_gerado: id,
        id_status: status,
        erros_envio: [],
      };
      sent.set(payload.order_client_id, result);
      parts.forEach((part, partIndex) => {
        const partQuote = quoteOrder(table, part, coupon);
        const partId = partIndex === 0 ? id : nextId++;
        remote.unshift({
          id: partId,
          orderClientId:
            partIndex === 0
              ? payload.order_client_id
              : `${payload.order_client_id}-${partIndex + 1}`,
          customerId: customer.id,
          customerCnpj: customer.cnpj,
          customerName: customer.name,
          tableName: table.name,
          status,
          prazo: payload.array_ordem_envio[0]?.prazo ?? 0,
          dataEnvio: dates[partIndex] ?? dates[0],
          createdAt: payload.datahora_criacao,
          subOrders: payload.array_ordem_envio.map((opl, index) => {
            const distributor = customer.distributors.find(
              (item) => item.id === opl.id_distribuidor,
            );
            return {
              id: partId * 10 + index + 1,
              distributorName: distributor?.name ?? `Distribuidor ${opl.id_distribuidor}`,
              status,
              prazo: opl.prazo,
              items: partQuote.lines.map((line) => ({
                ean: line.ean,
                name: line.name,
                unitPrice: line.listPrice,
                discountPercent: line.discountPercent,
                quantPed: line.quantity,
                quantEsp: 0,
                quantNot: 0,
              })),
            };
          }),
        });
      });
      return result;
    },

    async listOrders() {
      const today = new Date().toISOString().slice(0, 10);
      const current = promoteIfDue(remote, today);
      remote.splice(0, remote.length, ...current);
      return remote.map((order) => ({
        ...order,
        subOrders: order.subOrders.map((sub) => ({
          ...sub,
          items: sub.items.map((item) => ({ ...item })),
          invoice: sub.invoice ? { ...sub.invoice } : undefined,
        })),
      }));
    },

    async getBootstrap() {
      const { tracked, ...data } = fixtures;
      return JSON.parse(JSON.stringify(data));
    },
    async getGoals() {
      return fixtures.goals;
    },
  };

  /** O legado faz polling de status. A primeira consulta tira um pedido de "aguardando retorno". */
  function acceptAwaitingResponse(): { orderId: number; distributorName: string } | null {
    const order = remote.find((item) => item.status === 4);
    if (!order) {
      return null;
    }
    order.status = 1;
    const distributorName = order.subOrders[0]?.distributorName ?? 'Distribuidor';
    order.subOrders = order.subOrders.map((sub) =>
      sub.status === 4
        ? {
            ...sub,
            status: 1,
            items: sub.items.map((item) => ({ ...item, quantEsp: item.quantPed })),
          }
        : sub,
    );
    return { orderId: order.id, distributorName };
  }

  function simulateInvoice(orderClientId: string) {
    const order = remote.find((item) => item.orderClientId === orderClientId);
    if (!order) {
      return;
    }
    order.status = 1;
    order.subOrders = order.subOrders.map((sub, index) => {
      const items = sub.items.map((item) => ({
        ...item,
        quantEsp: item.quantPed,
        quantNot: item.quantPed,
      }));
      const value = Number(
        items
          .reduce(
            (sum, item) => sum + item.quantNot * item.unitPrice * (1 - item.discountPercent / 100),
            0,
          )
          .toFixed(2),
      );
      return {
        ...sub,
        status: 1,
        items,
        invoice: {
          number: `NF-${order.id}-${index + 1}`,
          value,
          issuedAt: new Date().toISOString().slice(0, 10),
        },
      };
    });
  }

  function transition(orderClientId: string, action: 'accept' | 'partial' | 'reject' | 'invoice') {
    const order = remote.find((item) => item.orderClientId === orderClientId);
    if (!order) return false;
    if (action === 'invoice') {
      simulateInvoice(orderClientId);
      return true;
    }
    const status = action === 'accept' ? 1 : action === 'partial' ? 10 : 11;
    order.status = status;
    order.subOrders = order.subOrders.map((sub) => ({
      ...sub,
      status,
      invoice: undefined,
      items: sub.items.map((item) => ({
        ...item,
        quantEsp:
          action === 'reject'
            ? 0
            : action === 'partial'
              ? Math.floor(item.quantPed / 2)
              : item.quantPed,
        quantNot: 0,
        reason:
          action === 'reject'
            ? 'Recusa simulada pelo distribuidor'
            : action === 'partial'
              ? 'Estoque parcial simulado'
              : undefined,
      })),
    }));
    return true;
  }
  function reset() {
    sent.clear();
    nextId = 9000;
    remote.splice(0, remote.length, ...JSON.parse(JSON.stringify(fixtures.tracked)));
  }
  return { client, acceptAwaitingResponse, simulateInvoice, transition, reset };
}
const shared = createMockClient();
export const mockClient = shared.client;
export const acceptAwaitingResponse = shared.acceptAwaitingResponse;
export const simulateInvoice = shared.simulateInvoice;
