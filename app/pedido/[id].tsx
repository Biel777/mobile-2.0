import { withSession } from '../../src/components/require-session';
import { apiConfig } from '../../src/api';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ProductFace } from '../../src/components/product-face';
import { Banner, Card, GhostButton, PrimaryButton } from '../../src/components/ui';
import { useAppStore } from '../../src/data/store';
import { money, quoteOrder } from '../../src/domain/pricing';
import { MAX_DISTRIBUTORS } from '../../src/domain/types';
import { colors, fonts, radius, space } from '../../src/theme';

const STEPS = ['Cliente', 'Condição', 'Distribuidores', 'Produtos'];

function stepFromParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  if (n >= 1 && n <= 3) return n;
  return 1;
}

function PedidoScreen() {
  const [retryConfirmed, setRetryConfirmed] = useState(false);
  const retryUncertain = useAppStore(state => state.retryUncertain);
  const catalog = useAppStore((state) => state.catalog);
  const { id, step: stepParam } = useLocalSearchParams<{ id: string; step?: string }>();
  const order = useAppStore((state) => state.orders.find((item) => item.id === id));
  const flush = useAppStore(state => state.flush);
  const refreshTracked = useAppStore(state => state.refreshTracked);
  const updateDraft = useAppStore((state) => state.updateDraft);
  const [step, setStep] = useState(() => stepFromParam(stepParam));

  useEffect(() => {
    setStep(stepFromParam(stepParam));
  }, [stepParam]);

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
    </ScrollView></View>;
  }

  const customer = catalog.customers.find((item) => item.id === order.customerId);
  const tables = catalog.tables.filter((table) => customer?.tableIds.includes(table.id));
  const table = catalog.tables.find((item) => item.id === order.tableId) ?? tables[0];
  const coupon = catalog.coupons.find((item) => item.code === order.couponCode);
  const quote = table ? quoteOrder(table, order.lines, coupon) : undefined;
  const selected = order.distributorIds ?? [];
  const prazos = order.prazos ?? {};
  const released = customer?.distributors ?? [];
  const prazosOk = selected.length > 0 && selected.every((distributorId) => prazos[distributorId]);
  const canNext = step === 1 || (step === 2 && selected.length <= MAX_DISTRIBUTORS && prazosOk);

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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>{customer?.name}</Text>
        <View style={styles.steps}>
          {STEPS.map((label, index) => {
            const active = index === step;
            const done = index < step && index > 0;
            return (
              <Pressable
                key={label}
                style={styles.stepNav}
                disabled={!done}
                onPress={() => setStep(index)}
              >
                <View style={[styles.dot, (active || index < step) && styles.dotOn]}>
                  <Text style={[styles.dotText, (active || index < step) && styles.dotTextOn]}>{index + 1}</Text>
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {step === 1 ? (
          <>
            <Text style={styles.title}>Condição comercial</Text>
            <Text style={styles.help}>Escolha a tabela vigente. O prazo é definido depois, em cada distribuidor.</Text>
            {tables.map((item) => {
              const on = item.id === table?.id;
              return (
                <Pressable key={item.id} onPress={() => updateDraft(order.id, { tableId: item.id, lines: [] })}>
                  <View style={[styles.option, on && styles.optionOn]}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>
                      Mínimo {money(item.minValue)}
                      {item.monthBilledNet ? ` · ${money(item.monthBilledNet)} já no mês` : ''} · até {item.expiresAt}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
            <View style={[styles.option, styles.disabled]}>
              <Text style={styles.name}>Pedido negociado</Text>
              <Text style={styles.meta}>
                {catalog.user.bloqueiaNegociado
                  ? 'Seu grupo não digita pedido sem tabela. Escolha uma condição comercial.'
                  : 'Disponível para este usuário.'}
              </Text>
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.title}>Ordem de distribuidores</Text>
            <Text style={styles.help}>
              Até {MAX_DISTRIBUTORS} da lista liberada. A posição 1 recebe primeiro. O prazo é do distribuidor.
            </Text>
            <Text style={styles.section}>
              Ordem de envio ({selected.length}/{MAX_DISTRIBUTORS})
            </Text>
            {selected.length === 0 ? <Text style={styles.meta}>Toque em um liberado para incluir.</Text> : null}
            {selected.map((distributorId, index) => {
              const item = released.find((entry) => entry.id === distributorId);
              return (
                <View key={distributorId} style={styles.option}>
                  <Text style={styles.name}>
                    {index + 1}. {item?.name}
                  </Text>
                  <Text style={styles.meta}>Prazo deste distribuidor</Text>
                  <View style={styles.row}>
                    {(item?.prazos ?? []).map((days) => (
                      <Pressable key={days} onPress={() => updateDraft(order.id, { prazos: { ...prazos, [distributorId]: days } })}>
                        <Text style={[styles.chip, prazos[distributorId] === days && styles.chipOn]}>{days} dias</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.actions}>
                    <Pressable style={styles.action} onPress={() => move(distributorId, -1)}>
                      <Text style={styles.actionText}>Subir</Text>
                    </Pressable>
                    <Pressable style={styles.action} onPress={() => move(distributorId, 1)}>
                      <Text style={styles.actionText}>Descer</Text>
                    </Pressable>
                    <Pressable
                      style={styles.action}
                      onPress={() => {
                        const next = { ...prazos };
                        delete next[distributorId];
                        updateDraft(order.id, {
                          distributorIds: selected.filter((entry) => entry !== distributorId),
                          prazos: next,
                        });
                      }}
                    >
                      <Text style={styles.actionText}>Remover</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
            <Text style={styles.section}>Liberados</Text>
            {released
              .filter((item) => !selected.includes(item.id))
              .map((item) => {
                const full = selected.length >= MAX_DISTRIBUTORS;
                return (
                  <Pressable
                    key={item.id}
                    disabled={full}
                    onPress={() => updateDraft(order.id, { distributorIds: [...selected, item.id] })}
                  >
                    <View style={[styles.option, full && styles.disabled]}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.meta}>
                        {full ? 'Limite de 6 atingido' : `Prazos ${item.prazos.join(', ')} dias · incluir`}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
          </>
        ) : null}

        {step === 3 && table ? (
          <>
            <Text style={styles.title}>Produtos e descontos</Text>
            <Text style={styles.help}>{table.name}. O líquido recalcula a cada quantidade.</Text>
            <Card>
              <Text style={styles.name}>Condição</Text>
              <Text style={styles.meta}>
                Mínimo {money(table.minValue)} líquido
                {table.monthBilledNet ? ` · ${money(table.monthBilledNet)} já no mês` : ''}
              </Text>
              {table.comboParticipation ? (
                <Text style={styles.meta}>Combo: o mix obrigatório precisa de {table.comboParticipation}% do líquido</Text>
              ) : null}
              {table.dividePedido ? <Text style={styles.meta}>Pode dividir o envio em duas datas.</Text> : null}
              <Text style={styles.meta}>{catalog.unsupportedFeatures?.includes('coupons') ? 'Cupom indisponível nesta integração' : <>Cupom {coupon ? `${coupon.code} +${coupon.percent}%` : 'nenhum'} · confirmado no envio</>}</Text>
              <TextInput
                value={order.couponCode ?? ''}
                autoCapitalize="characters"
                placeholder="Código do cupom"
                editable={!catalog.unsupportedFeatures?.includes('coupons')}
                style={styles.coupon}
                onChangeText={(value) => updateDraft(order.id, { couponCode: value.trim().toUpperCase() || undefined })}
              />
            </Card>
            <View style={{ height: space.sm }} />
            {table.products.map((product) => {
              const qty = order.lines.find((line) => line.ean === product.ean)?.quantity ?? 0;
              const line = quote?.lines.find((item) => item.ean === product.ean);
              const setQty = (quantity: number) => {
                const lines = order.lines.filter((entry) => entry.ean !== product.ean);
                if (quantity > 0) lines.push({ ean: product.ean, quantity });
                updateDraft(order.id, { lines });
              };
              return (
                <View key={product.ean} style={styles.product}>
                  <Card>
                    <View style={styles.productHead}>
                      <ProductFace name={product.name} restricted={product.photoRestricted} />
                      <View style={styles.productInfo}>
                        <Text style={styles.name}>{product.name}</Text>
                        <Text style={styles.price}>{money(product.listPrice)}</Text>
                        <Text style={styles.meta}>Base {product.baseDiscount}%</Text>
                      </View>
                    </View>
                    {(() => {
                      const tiers = [...product.tiers].sort((a, b) => a.quantMin - b.quantMin);
                      const next = tiers.find((tier) => qty < tier.quantMin);
                      const gives = table.triggers.filter((rule) => rule.triggerEan === product.ean);
                      const receives = table.triggers.filter((rule) => rule.childEan === product.ean);
                      return (
                        <View style={styles.mechanics}>
                          {next ? (
                            <Text style={styles.nextTier}>
                              {qty === 0
                                ? `Peça ${next.quantMin} un para +${next.percent}%`
                                : `Faltam ${next.quantMin - qty} un para +${next.percent}%`}
                            </Text>
                          ) : tiers.length > 0 ? (
                            <Text style={styles.nextTier}>Faixa máxima · +{tiers[tiers.length - 1].percent}%</Text>
                          ) : (
                            <Text style={styles.meta}>Sem faixa progressiva</Text>
                          )}
                          {tiers.length > 0 ? (
                            <View style={styles.ladder}>
                              {tiers.slice(0, 5).map((tier) => {
                                const reached = qty >= tier.quantMin;
                                const focus = next?.quantMin === tier.quantMin;
                                return (
                                  <View
                                    key={tier.quantMin}
                                    style={[styles.tierChip, focus && styles.tierNext, reached && styles.tierDone]}
                                  >
                                    <Text style={styles.tierUnits}>{tier.quantMin}</Text>
                                    <Text style={styles.tierPct}>+{tier.percent}%</Text>
                                  </View>
                                );
                              })}
                            </View>
                          ) : null}
                          {gives.map((rule) => {
                            const child = table.products.find((item) => item.ean === rule.childEan);
                            const left = rule.threshold - qty;
                            return (
                              <Text key={`out-${rule.childEan}`} style={styles.mechLine}>
                                Gatilho: a partir de {rule.threshold} un, +{rule.extraPercent}% em {child?.name}
                                {left > 0 ? ` · faltam ${left} un` : ' · ativo'}
                              </Text>
                            );
                          })}
                          {receives.map((rule) => {
                            const parent = table.products.find((item) => item.ean === rule.triggerEan);
                            const parentQty = order.lines.find((line) => line.ean === rule.triggerEan)?.quantity ?? 0;
                            const left = rule.threshold - parentQty;
                            return (
                              <Text key={`in-${rule.triggerEan}`} style={styles.mechLine}>
                                Gatilho: +{rule.extraPercent}% com {rule.threshold} un de {parent?.name}
                                {left > 0 ? ` · faltam ${left} un` : ' · ativo'}
                              </Text>
                            );
                          })}
                          {product.ceilingDiscount != null ? (
                            <Text style={styles.mechLine}>Teto {product.ceilingDiscount}%. O desconto não passa disso.</Text>
                          ) : null}
                          {product.required === 'required' ? <Text style={styles.mechLine}>Obrigatório nesta condição.</Text> : null}
                          <Text style={styles.mechLine}>
                            De {product.packSize} em {product.packSize} · mínimo {product.minQty} un
                            {product.maxQty ? ` · máximo ${product.maxQty} un` : ''}
                          </Text>
                        </View>
                      );
                    })()}
                    <View style={styles.qtyRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Diminuir ${product.name}`}
                        style={styles.stepBtn}
                        onPress={() => setQty(Math.max(0, qty - product.packSize))}
                      >
                        <Text style={styles.stepBtnText}>−</Text>
                      </Pressable>
                      <TextInput
                        accessibilityLabel={`Quantidade ${product.name}`}
                        value={qty ? String(qty) : ''}
                        keyboardType="number-pad"
                        placeholder="0"
                        style={styles.qty}
                        onChangeText={(value) => setQty(Number(value.replace(/\D/g, '')) || 0)}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Aumentar ${product.name}`}
                        style={styles.stepBtn}
                        onPress={() => setQty(qty + product.packSize)}
                      >
                        <Text style={styles.stepBtnText}>+</Text>
                      </Pressable>
                    </View>
                    {line ? (
                      <Text style={styles.line}>
                        {line.badges.length ? line.badges.join(' · ') : 'desconto base'} · {line.discountPercent}% · {money(line.net)}
                      </Text>
                    ) : null}
                  </Card>
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {step === 3 && quote && table ? (
          <View style={styles.footerFacts}>
            <Text style={styles.footerNet}>Líquido {money(quote.net)}</Text>
            <Text style={styles.footerGap}>
              {(() => {
                const month = table.monthBilledNet ?? 0;
                const current = table.minValueBasis === 'GROSS' ? quote.gross : quote.net;
                const left = table.minValue - (current + month);
                return left > 0 ? `Faltam ${money(left)} para o mínimo` : 'Mínimo da condição atingido';
              })()}
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
              <PrimaryButton title="Continuar" disabled={!canNext} onPress={() => setStep(step + 1)} />
            ) : (
              <PrimaryButton title="Revisar pedido" onPress={() => router.push(`/pedido/${order.id}/revisao`)} />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, paddingBottom: 24, width: '100%' },
  product: { marginBottom: space.sm, width: '100%', maxWidth: '100%', minWidth: 0 },
  productHead: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  productInfo: { flex: 1, minWidth: 0 },
  mechanics: { marginTop: 12, gap: 8 },
  nextTier: { fontFamily: fonts.bodyStrong, color: colors.ink, fontSize: 14 },
  ladder: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tierChip: {
    minWidth: 52,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.page,
    alignItems: 'center',
  },
  tierNext: { backgroundColor: colors.yellowSoft, borderColor: colors.ink },
  tierDone: { backgroundColor: colors.greenSoft, borderColor: colors.mint },
  tierUnits: { fontFamily: fonts.bodyStrong, fontSize: 13, color: colors.ink },
  tierPct: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.teal },
  mechLine: { color: colors.text, fontFamily: fonts.body, fontSize: 13 },
  steps: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.md },
  stepNav: { alignItems: 'center', flex: 1 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.ink },
  dotText: { color: colors.text, fontFamily: fonts.bodyStrong, fontSize: 12 },
  dotTextOn: { color: colors.onPrimary },
  stepLabel: { marginTop: 4, fontSize: 11, color: colors.muted, fontFamily: fonts.body, textAlign: 'center' },
  stepLabelOn: { color: colors.ink, fontFamily: fonts.bodyStrong },
  kicker: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 12 },
  title: { fontSize: 22, fontFamily: fonts.displayBold, color: colors.ink, marginBottom: 4 },
  help: { color: colors.text, fontFamily: fonts.body, marginBottom: space.sm },
  section: { fontFamily: fonts.display, color: colors.ink, marginTop: space.md, marginBottom: space.sm },
  name: { fontFamily: fonts.display, color: colors.ink, fontSize: 16 },
  meta: { color: colors.text, fontFamily: fonts.body, marginTop: 2 },
  option: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.sm,
  },
  optionOn: { borderColor: colors.teal, backgroundColor: colors.greenSoft },
  disabled: { opacity: 0.55 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    fontFamily: fonts.bodyStrong,
    overflow: 'hidden',
    minHeight: 44,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink, color: colors.onPrimary },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  action: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
  },
  actionText: { color: colors.ink, fontFamily: fonts.bodyStrong, fontSize: 13 },
  qtyRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  stepBtn: {
    width: 48,
    flexGrow: 0,
    flexShrink: 0,
    minHeight: 48,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.teal, fontSize: 22, fontFamily: fonts.displayBold },
  coupon: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    fontFamily: fonts.body,
    color: colors.ink,
  },
  qty: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    width: 0,
    textAlign: 'center',
    paddingVertical: 10,
    fontFamily: fonts.bodyStrong,
    color: colors.ink,
    fontSize: 18,
  },
  price: { marginTop: 4, fontFamily: fonts.displayBold, fontSize: 18, color: colors.ink },
  line: { marginTop: 8, color: colors.teal, fontFamily: fonts.bodyStrong },
  footer: {
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    gap: 8,
  },
  footerFacts: { marginBottom: 4 },
  footerNet: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.ink },
  footerGap: { fontFamily: fonts.body, color: colors.text, marginTop: 2 },
  footerButtons: { flexDirection: 'row', gap: 8 },
  footerSide: { flex: 1 },
  footerMain: { flex: 1.4 },
});

export default withSession(PedidoScreen);
