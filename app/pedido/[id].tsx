import { minimumRemaining } from '@bff/cases/sales';
import { withSession } from '@components/require-session';
import { ConditionStep } from '@components/order/condition';
import { DistributorsStep } from '@components/order/distributors';
import { ProductsStep } from '@components/order/products';
import { orderStyles as styles } from '@components/order/styles';
import { AppIcon } from '@components/icons';
import { OrderUpdateHistory } from '@components/order-updates';

import { useConnection } from '@bff/cases/connection';
import { resolveOrderTable } from '@bff/cases/sales';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Banner, GhostButton, PrimaryButton } from '@components/ui';
import { useAppStore } from '@bff/cases/sales';
import { money, quoteOrder } from '@bff/cases/sales';
import { isPortfolioCustomer } from '@bff/cases/sales';
import { MAX_DISTRIBUTORS } from '@bff/contract';
import { colors } from '../../src/theme';


const STEPS = ['Cliente', 'Condição', 'Distribuidores', 'Produtos'];

function stepFromParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  if (n >= 1 && n <= 3) return n;
  return 1;
}

function PedidoScreen() {
  const apiConfig = useConnection(state => state.config);
  const scroll = useRef<ScrollView>(null);
  const [openDeadline, setOpenDeadline] = useState<number | null>(null);
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const retryUncertain = useAppStore(state => state.retryUncertain);
  const catalog = useAppStore((state) => state.catalog);
  const { id, step: stepParam } = useLocalSearchParams<{ id: string; step?: string }>();
  const order = useAppStore((state) => state.orders.find((item) => item.id === id));
  const flush = useAppStore(state => state.flush);
  const refreshTracked = useAppStore(state => state.refreshTracked);
  const pullUpdates = useAppStore(state => state.pullUpdates);
  const syncing = useAppStore(state => state.syncing);
  const online = useAppStore(state => state.online);
  const updateDraft = useAppStore((state) => state.updateDraft);
  const [step, setStep] = useState(() => stepFromParam(stepParam));

  useEffect(() => { scroll.current?.scrollTo({ y: 0, animated: false }); setOpenDeadline(null); }, [step]);

  useEffect(() => {
    setStep(stepFromParam(stepParam));
  }, [stepParam]);

  useEffect(() => {
    if (!order || order.tableId !== 0) return;
    const customer = catalog.customers.find(item => item.id === order.customerId);
    const tableId = customer?.tableIds.find(id => catalog.tables.some(table => table.id === id));
    if (tableId) updateDraft(order.id, { tableId });
  }, [catalog, order, updateDraft]);

  if (!order) {
    return null;
  }

  if (order.queueStatus === 'sent' || order.queueStatus === 'sending' || order.deliveryUncertain) {
    return <View style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
      <Banner text={order.deliveryUncertain ? 'A confirmação do envio está incerta. Consulte ou reenvie o mesmo pedido antes de editar, para evitar duplicidade.' : order.queueStatus === 'sending' ? 'Pedido em envio. Aguarde a confirmação.' : 'Pedido já enviado. Consulte o acompanhamento.'} />
      <PrimaryButton title={apiConfig.protocol === 'legacy' ? 'Consultar confirmação' : 'Consultar / tentar novamente'}
        onPress={() => { void (async () => { await refreshTracked(); await flush(); })(); }} />
      {apiConfig.protocol === 'legacy' && order.deliveryUncertain && !order.remoteId ? <>
        <Banner text="Antes de repetir, confira no Sales API se o pedido foi registrado. O legado ainda não tem deduplicação homologada. Reenviar pode duplicar uma venda já recebida." />
        <GhostButton title={retryConfirmed ? 'Conferi e não existe no Sales API: reenviar' : 'Já conferi o pedido no Sales API'}
          onPress={() => { if (retryConfirmed) { retryUncertain(order.id); setRetryConfirmed(false); } else setRetryConfirmed(true); }} />
      </> : null}
      <GhostButton title="Ver acompanhamento" onPress={() => router.push('/pedidos')} />
    <OrderUpdateHistory localOrderId={order.id} />
      </ScrollView></View>;
  }

  const customer = catalog.customers.find((item) => item.id === order.customerId);
  const tables = catalog.tables.filter((table) => customer?.tableIds.includes(table.id));
  const table = resolveOrderTable(tables.find((item) => item.id === order.tableId), order);
  if (!customer || !isPortfolioCustomer(customer) || !tables.length) {
    const message = !customer ? 'O cadastro desta loja ainda não foi carregado. Sincronize para consultar as condições comerciais.'
      : !isPortfolioCustomer(customer) ? 'Esta loja não está mais disponível na sua carteira. Atualize os dados para escolher uma loja liberada.'
      : 'Nenhuma condição comercial está disponível para esta loja. Sincronize para atualizar as liberações.';
    return <View style={styles.screen}><ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>{customer?.name ?? order.customerName ?? 'Loja selecionada'}</Text>
      <Banner text={message} />
      {!online ? <Banner text="Sem conexão. Você pode retomar este rascunho quando os dados da loja estiverem disponíveis." /> : null}
      <PrimaryButton title={syncing ? 'Sincronizando…' : 'Sincronizar dados da loja'} disabled={syncing || !online}
        onPress={() => { void pullUpdates(); }} />
      <GhostButton title="Voltar para as lojas" onPress={() => router.push('/positivacao')} />
    <OrderUpdateHistory localOrderId={order.id} />
      </ScrollView></View>;
  }

  const coupon = catalog.coupons.find((item) => item.code === order.couponCode);
  const quote = table ? quoteOrder(table, order.lines, coupon) : undefined;
  const selected = order.distributorIds ?? [];
  const prazos = order.prazos ?? {};
  const released = customer?.distributors ?? [];
  const prazosOk = selected.length > 0 && selected.every(id => released.find(item => item.id === id)?.prazos.includes(prazos[id]));
  const canNext = (step === 1 && !!table) || (step === 2 && selected.length <= MAX_DISTRIBUTORS && prazosOk);

  function move(distributorId: number, direction: -1 | 1) {
    const index = selected.indexOf(distributorId);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= selected.length) return;
    const copy = [...selected];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    updateDraft(order!.id, { distributorIds: copy });
  }

  return (
    <View style={styles.screen}>
      <ScrollView ref={scroll} contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{customer?.name}</Text>
        <View style={styles.steps}>
          {STEPS.map((label, index) => {
            const active = index === step;
            const done = index < step && index > 0;
            return (
              <Pressable
                key={label}
                style={styles.stepNav}
                accessibilityRole="button"
                accessibilityLabel={`Etapa ${index + 1} de ${STEPS.length}: ${label}${active ? ", atual" : ""}`}
                accessibilityState={{ selected: active, disabled: !done }}
                disabled={!done}
                onPress={() => setStep(index)}
              >
                <View style={[styles.dot, index < step && styles.dotDone, active && styles.dotOn]}>
                  {index < step ? <AppIcon name="check" size={14} color={colors.teal} /> : <Text style={[styles.dotText, active && styles.dotTextOn]}>{index + 1}</Text>}
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.stepLabel, active && styles.stepLabelOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {step === 1 ? <ConditionStep order={order} tables={tables} table={table} updateDraft={updateDraft} /> : null}

        {step === 2 ? <DistributorsStep order={order} selected={selected} prazos={prazos} released={released} openDeadline={openDeadline} setOpenDeadline={setOpenDeadline} updateDraft={updateDraft} move={move} /> : null}

        {step === 3 && table ? <ProductsStep catalog={catalog} order={order} table={table} coupon={coupon} quote={quote} updateDraft={updateDraft} /> : null}
      <OrderUpdateHistory localOrderId={order.id} />
      </ScrollView>

      <View style={styles.footer}>
        {step === 2 && !prazosOk ? <Text style={styles.footerHint}>{selected.length ? 'Escolha o prazo de cada distribuidor para avançar.' : 'Adicione um distribuidor para avançar.'}</Text> : null}
        {step === 3 && quote && table ? (
          <View style={styles.footerFacts}>
            <Text style={styles.footerNet}>Líquido {money(quote.net)}</Text>
            <Text style={styles.footerGap}>
              {minimumRemaining(table, quote) > 0 ? `Faltam ${money(minimumRemaining(table, quote))} para o mínimo` : 'Mínimo da condição atingido'}
            </Text>
          </View>
        ) : null}
        <View style={styles.footerButtons}>
          {step > 1 ? (
            <View style={styles.footerSide}>
              <GhostButton title="Voltar" onPress={() => setStep(step - 1)} />
            </View>
          ) : null}
          <View style={styles.footerMain}>
            {step < 3 ? (
              <PrimaryButton title={step === 1 ? "Escolher distribuidores" : "Escolher produtos"} disabled={!canNext} onPress={() => setStep(step + 1)} />
            ) : (
              <PrimaryButton title="Revisar pedido" onPress={() => router.push(`/pedido/${order.id}/revisao`)} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}



export default withSession(PedidoScreen);
