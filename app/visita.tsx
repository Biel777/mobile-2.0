import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { withSession } from '@components/require-session';
import { Banner, Card, PrimaryButton, GhostButton } from '@components/ui';
import { useVisitDay } from '@components/visits';
import { useAppStore } from '@bff/cases/sales';
import { startOrderForPdv } from '@bff/cases/sales';
import { getCustomerOrders, getVisitCustomers } from '@bff/cases/sales';
import { isAttention } from '@bff/cases/sales';
import { statusLabel } from '@bff/cases/sales';
import { colors, fonts, radius, space } from '../src/theme';

function VisitCustomerScreen() {
  const { customerId } = useLocalSearchParams<{ customerId: string }>();
  const catalog = useAppStore(state => state.catalog);
  const tracked = useAppStore(state => state.tracked);
  const orders = useAppStore(state => state.orders);
  const updates = useAppStore(state => state.orderUpdates);
  const visits = useAppStore(state => state.visits);
  const lastSync = useAppStore(state => state.lastSync);
  const online = useAppStore(state => state.online);
  const syncing = useAppStore(state => state.syncing);
  const syncError = useAppStore(state => state.syncError);
  const pull = useAppStore(state => state.pullUpdates);
  const complete = useAppStore(state => state.setVisitCompleted);
  const add = useAppStore(state => state.addVisit);
  const day = useVisitDay();
  const [limit, setLimit] = useState(5);
  const [error, setError] = useState('');
  const customer = getVisitCustomers(catalog).find(item => String(item.id) === customerId);
  if (!customer) return <View style={styles.content}><Banner text="Loja não disponível na carteira sincronizada. Atualize os dados para preparar a visita." /><PrimaryButton title="Voltar à agenda" onPress={() => router.replace('/visitas')} /></View>;
  const history = getCustomerOrders(customer, tracked, orders);
  const families = catalog.goals.families.filter(family => family.semPositivar.some(pdv => pdv.id === customer.id));
  const withoutBilling = catalog.goals.pdvsSemPositivar.some(pdv => pdv.id === customer.id);
  const visit = visits.find(item => item.customerId === customer.id && item.date === day);
  const attention = updates.filter(update => isAttention(update) && (history.tracked.some(order => order.id === update.orderId) || history.local.some(order => order.id === update.localOrderId)));
  const run = (action: () => void) => { try { setError(''); action(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.'); } };
  const rows = [
    ...history.tracked.map(order => ({ key: `remote:${order.id}`, date: order.createdAt, title: `Pedido ${order.id}`, status: statusLabel(order.status), path: `/pedidos/${order.id}` as const })),
    ...history.local.map(order => ({ key: `local:${order.id}`, date: order.createdAt, title: 'Pedido neste aparelho', status: order.queueStatus === 'failed' ? 'Falha no envio' : order.queueStatus === 'pending' ? 'Na fila de envio' : order.queueStatus === 'sent' ? 'Enviado' : order.queueStatus === 'sending' ? 'Enviando' : 'Em digitação', path: `/pedido/${order.id}` as const })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return <ScrollView contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>Preparar visita · {day.split('-').reverse().join('/')}</Text><Text style={styles.title}>{customer.name}</Text><Text style={styles.meta}>{customer.city}{customer.cnpj ? ` · ${customer.cnpj}` : ''}</Text>
    <Text style={styles.hint}>{lastSync ? `Dados sincronizados em ${new Date(lastSync).toLocaleString('pt-BR')}` : 'Sem sincronização recente'}</Text>
    {!online ? <Banner text="Offline · mostrando os dados salvos neste aparelho." /> : null}
    {error || syncError ? <Banner tone="danger" text={error || syncError!} /> : null}
    <View style={styles.actions}><PrimaryButton title="Digitar pedido" onPress={() => run(() => startOrderForPdv(customer))} />
      <GhostButton title={!visit ? 'Adicionar à agenda de hoje' : visit.completedAt ? 'Reabrir visita de hoje' : 'Concluir visita de hoje'} onPress={() => run(() => !visit ? add(customer.id, day) : complete(customer.id, day, !visit.completedAt))} />
    </View>
    {visit?.completedAt ? <Text style={styles.completed}>Visita concluída. Os pedidos e a positivação continuam sendo atualizados pela sincronização.</Text> : null}
    <Text style={styles.section}>O que falta positivar</Text>
    <Card><Text style={styles.period}>{catalog.goals.periodLabel || 'Período não informado'}</Text>
      <Text style={styles.strong}>{withoutBilling ? 'Loja sem faturamento no período' : 'Sem pendência de loja informada'}</Text>
      {families.length ? <View style={{ marginTop: 8 }}>{families.map(family => <View key={family.family} style={styles.family}><Text style={styles.body}>{family.family}</Text><Text style={styles.tag}>A positivar</Text></View>)}</View> : <Text style={styles.hint}>{catalog.goals.families.length ? 'Nenhuma família pendente informada para esta loja.' : 'A integração não informou a positivação por família.'}</Text>}
      <Text style={styles.hint}>Positivação considera os dados recebidos. Criar um pedido ou concluir a visita não confirma faturamento.</Text>
    </Card>
    {attention.length ? <><Text style={styles.section}>Pedidos que precisam de atenção</Text>{attention.map(update => <Pressable key={update.key} accessibilityRole="button" accessibilityLabel={`Ver pendência: ${update.title}`} onPress={() => router.push(update.orderId && history.tracked.some(order => order.id === update.orderId) ? `/pedidos/${update.orderId}` : `/pedido/${update.localOrderId}`)} style={styles.warning}><Text style={styles.strong}>{update.title}</Text><Text style={styles.body}>{update.summary}</Text><Text style={styles.link}>Conferir pedido</Text></Pressable>)}</> : null}
    <Text style={styles.section}>Histórico de pedidos</Text><Text style={styles.hint}>Pedidos disponíveis na sincronização e neste aparelho. O histórico pode não incluir toda a movimentação da loja.</Text>
    {rows.length ? rows.slice(0, limit).map(row => <Pressable key={row.key} accessibilityRole="button" accessibilityLabel={`Abrir ${row.title}, ${row.status}`} onPress={() => router.push(row.path)} style={styles.order}><View style={styles.orderRow}><Text style={styles.strong}>{row.title}</Text><Text style={styles.link}>Ver pedido</Text></View><Text style={styles.body}>{row.status}</Text><Text style={styles.hint}>{new Date(row.date).toLocaleString('pt-BR')}</Text></Pressable>) : <Banner text="Nenhum pedido vinculado a esta loja nos dados disponíveis. Atualize para consultar novos pedidos." />}
    {rows.length > limit ? <GhostButton title={`Ver mais (${rows.length - limit} restantes)`} onPress={() => setLimit(limit + 10)} /> : null}
    <View style={{ marginTop: space.md }}><GhostButton title={syncing ? 'Atualizando…' : 'Atualizar informações'} onPress={() => { if (online && !syncing) void pull(); }} /></View>
  </ScrollView>;
}
export default withSession(VisitCustomerScreen);
const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: 40 }, kicker: { fontFamily: fonts.bodyStrong, color: colors.teal, fontSize: 12 }, title: { fontFamily: fonts.displayBold, color: colors.ink, fontSize: 26, marginTop: 6 },
  meta: { color: colors.text, fontFamily: fonts.body, fontSize: 13, marginTop: 4 }, hint: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18, marginVertical: 8 },
  actions: { gap: 8, marginTop: 8 }, completed: { fontFamily: fonts.bodyStrong, fontSize: 12, lineHeight: 18, color: colors.success, marginTop: 12 }, section: { fontFamily: fonts.display, color: colors.ink, fontSize: 18, marginTop: space.lg, marginBottom: 8 },
  period: { fontFamily: fonts.bodyStrong, color: colors.teal, fontSize: 12, marginBottom: 8 }, strong: { fontFamily: fonts.bodyStrong, color: colors.ink, fontSize: 14 }, body: { fontFamily: fonts.body, color: colors.text, fontSize: 13, lineHeight: 19, marginTop: 5 },
  family: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingVertical: 10 }, tag: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.teal },
  link: { fontFamily: fonts.bodyStrong, color: colors.teal, fontSize: 12 }, warning: { padding: space.md, borderRadius: radius.md, backgroundColor: colors.warnBg, marginBottom: 8, gap: 6 }, order: { padding: space.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.lg, marginBottom: 8 }, orderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
});
