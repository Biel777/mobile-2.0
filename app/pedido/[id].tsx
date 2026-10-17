import { AppIcon } from '../../src/components/icons';
import { OrderUpdateHistory } from '../../src/components/order-updates';
import { withSession } from '../../src/components/require-session';
import { apiConfig } from '../../src/api';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ProductFace } from '../../src/components/product-face';
import { Banner, Card, GhostButton, PrimaryButton } from '../../src/components/ui';
import { useAppStore } from '../../src/data/store';
import { money, quoteOrder } from '../../src/domain/pricing';
import { isPortfolioCustomer } from '../../src/domain/portfolio';
import { MAX_DISTRIBUTORS } from '../../src/domain/types';
import { colors, fonts, radius, space } from '../../src/theme';

const displayDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;

const STEPS = ['Cliente', 'Condição', 'Distribuidores', 'Produtos'];

function stepFromParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number(raw);
  if (n >= 1 && n <= 3) return n;
  return 1;
}

function PedidoScreen() {
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
  }, [catalog, order?.id, order?.tableId, updateDraft]);

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
  const table = tables.find((item) => item.id === order.tableId);
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

        {step === 1 ? (
          <>
            <Text style={styles.title}>Condição comercial</Text>
            <Text style={styles.help}>Escolha a condição para este pedido. Os prazos serão definidos com os distribuidores.</Text>
            {tables.map((item) => {
              const on = item.id === table?.id;
              return (
                <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${item.name}. Mínimo ${money(item.minValue)} ${item.minValueBasis === 'GROSS' ? 'bruto' : 'líquido'}. Validade ${displayDate(item.expiresAt)}.`} onPress={() => { if (item.id !== order.tableId) updateDraft(order.id, { tableId: item.id, lines: [] }); }} style={[styles.option, on && styles.optionOn]}>
                  <View style={styles.optionHeading}><Text style={[styles.name, { flex: 1 }]}>{item.name}</Text><View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View></View>
                  <View style={styles.conditionFacts}>
                    <View style={styles.fact}><Text style={styles.factLabel}>Mínimo {item.minValueBasis === 'GROSS' ? 'bruto' : 'líquido'}</Text><Text style={styles.factValue}>{money(item.minValue)}</Text></View>
                    {item.monthBilledNet != null && item.monthBilledNet > 0 ? <View style={styles.fact}><Text style={styles.factLabel}>Faturado no mês</Text><Text style={styles.factValue}>{money(item.monthBilledNet)}</Text></View> : null}
                  </View>
                  <View style={styles.validity}><AppIcon name="calendar" size={14} color={colors.muted} /><Text style={styles.factLabel}>Válida até {displayDate(item.expiresAt)}</Text></View>
                </Pressable>
              );
            })}

          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={styles.title}>Ordem de distribuidores</Text>
            <Text style={styles.help}>
              Escolha até {MAX_DISTRIBUTORS}. O primeiro da lista recebe o pedido antes dos demais.
            </Text>
            <Text style={styles.section}>
              Ordem de envio ({selected.length}/{MAX_DISTRIBUTORS})
            </Text>
            {selected.length === 0 ? <Text style={styles.meta}>Adicione um distribuidor da lista abaixo e escolha o prazo.</Text> : null}
            {selected.map((distributorId, index) => {
              const item = released.find((entry) => entry.id === distributorId);
              return (
                <View key={distributorId} style={styles.distributorCard}>
                  <View style={styles.distributorHead}>
                    <View style={styles.priority}><Text style={styles.priorityText}>{index + 1}</Text></View>
                    <Text style={[styles.name, { flex: 1 }]}>{item?.name ?? 'Distribuidor indisponível'}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item?.name ?? 'distribuidor'} da ordem de envio`} style={styles.iconAction} onPress={() => {
                      const next = { ...prazos }; delete next[distributorId];
                      updateDraft(order.id, { distributorIds: selected.filter(entry => entry !== distributorId), prazos: next });
                      if (openDeadline === distributorId) setOpenDeadline(null);
                    }}><AppIcon name="x" color={colors.muted} size={18} /></Pressable>
                  </View>
                  <View style={styles.distributorTools}>
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded: openDeadline === distributorId }} accessibilityLabel={`Prazo de ${item?.name ?? 'distribuidor'}: ${item?.prazos.includes(prazos[distributorId]) ? `${prazos[distributorId]} dias` : 'escolher'}`} onPress={() => setOpenDeadline(openDeadline === distributorId ? null : distributorId)} style={styles.deadline}>
                      <Text style={styles.factLabel}>Prazo</Text><Text style={styles.deadlineValue}>{item?.prazos.includes(prazos[distributorId]) ? `${prazos[distributorId]} dias` : 'Escolher'}</Text><AppIcon name={openDeadline === distributorId ? 'chevron-up' : 'chevron-down'} color={colors.teal} size={16} />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar prioridade de ${item?.name ?? 'distribuidor'}`} accessibilityState={{ disabled: index === 0 }} disabled={index === 0} style={[styles.iconAction, index === 0 && styles.disabled]} onPress={() => move(distributorId, -1)}><AppIcon name="arrow-up" size={18} color={colors.ink} /></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir prioridade de ${item?.name ?? 'distribuidor'}`} accessibilityState={{ disabled: index === selected.length - 1 }} disabled={index === selected.length - 1} style={[styles.iconAction, index === selected.length - 1 && styles.disabled]} onPress={() => move(distributorId, 1)}><AppIcon name="arrow-down" size={18} color={colors.ink} /></Pressable>
                  </View>
                  {openDeadline === distributorId ? <View style={styles.deadlineOptions} accessibilityRole="radiogroup" accessibilityLabel={`Prazos de ${item?.name}`}>
                    {(item?.prazos ?? []).map(days => <Pressable key={days} accessibilityRole="radio" accessibilityState={{ checked: prazos[distributorId] === days }} accessibilityLabel={`${days} dias para ${item?.name}`} onPress={() => { updateDraft(order.id, { prazos: { ...prazos, [distributorId]: days } }); setOpenDeadline(null); }} style={[styles.deadlineChoice, prazos[distributorId] === days && styles.deadlineChoiceOn]}><Text style={styles.deadlineValue}>{days} dias</Text>{prazos[distributorId] === days ? <AppIcon name="check" size={14} color={colors.teal} /> : null}</Pressable>)}
                    {!item?.prazos.length ? <Text style={styles.factLabel}>Nenhum prazo disponível. Atualize os dados.</Text> : null}
                  </View> : null}
                </View>
              );
            })}
            <Text style={styles.section}>Liberados</Text>
            {released
              .filter((item) => !selected.includes(item.id))
              .map((item) => {
                const full = selected.length >= MAX_DISTRIBUTORS;
                return (
                  <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Adicionar ${item.name} à ordem de envio`} accessibilityState={{ disabled: full }} disabled={full}
                    onPress={() => { updateDraft(order.id, { distributorIds: [...selected, item.id] }); setOpenDeadline(item.id); }} style={[styles.available, full && styles.disabled]}>
                    <View style={{ flex: 1 }}><Text style={styles.name}>{item.name}</Text><Text style={styles.factLabel}>{full ? 'Limite de 6 atingido' : `Prazos de ${item.prazos.join(', ')} dias`}</Text></View>
                    <AppIcon name="plus-circle" size={22} color={colors.teal} />
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
                        <AppIcon name="minus" color={colors.teal} size={20} />
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
                        <AppIcon name="plus" color={colors.teal} size={20} />
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
      <OrderUpdateHistory localOrderId={order.id} />
      </ScrollView>

      <View style={styles.footer}>
        {step === 2 && !prazosOk ? <Text style={styles.footerHint}>{selected.length ? 'Escolha o prazo de cada distribuidor para avançar.' : 'Adicione um distribuidor para avançar.'}</Text> : null}
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
              <PrimaryButton title={step === 1 ? "Ver distribuidores" : "Escolher produtos"} disabled={!canNext} onPress={() => setStep(step + 1)} />
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
  steps: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, marginBottom: 20 },
  stepNav: { alignItems: 'center', flex: 1, minWidth: 0, minHeight: 48 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.lineSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.mint },
  dotOn: { backgroundColor: colors.ink },
  dotText: { color: colors.text, fontFamily: fonts.bodyStrong, fontSize: 12 },
  dotTextOn: { color: colors.onPrimary },
  stepLabel: { width: '100%', lineHeight: 16, marginTop: 6, fontSize: 10, color: colors.muted, fontFamily: fonts.body, textAlign: 'center' },
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
  optionOn: { borderColor: colors.teal, backgroundColor: colors.card },
  disabled: { opacity: 0.55 },
  optionHeading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.teal }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.teal },
  conditionFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 16, marginBottom: 12 },
  fact: { flex: 1, minWidth: 110 }, factLabel: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  factValue: { color: colors.ink, fontFamily: fonts.bodyStrong, fontSize: 16, marginTop: 3 },
  validity: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 10 },
  distributorCard: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.lg, padding: 12, marginBottom: 8 },
  distributorHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priority: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  priorityText: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.tealPressed },
  distributorTools: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  iconAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  deadline: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: colors.page },
  deadlineValue: { fontFamily: fonts.bodyStrong, color: colors.ink, fontSize: 12 },
  deadlineOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: 8, marginTop: 8 },
  deadlineChoice: { minHeight: 44, minWidth: 64, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radius.md },
  deadlineChoiceOn: { backgroundColor: colors.mint },
  available: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.lg, padding: 16, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  footerHint: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 18 },
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
  footerSide: { width: 84 },
  footerMain: { flex: 1, minWidth: 0 },
});

export default withSession(PedidoScreen);
