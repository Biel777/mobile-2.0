import { isPortfolioCustomer } from '@bff/cases/sales';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { withSession } from '@components/require-session';
import { AppIcon } from '@components/icons';
import { Banner } from '@components/ui';
import { useVisitDay } from '@components/visits';
import { useAppStore } from '@bff/cases/sales';
import { getVisitCustomers } from '@bff/cases/sales';
import { colors, fonts, radius, space } from '../src/theme';

function VisitsScreen() {
  const day = useVisitDay();
  const catalog = useAppStore(state => state.catalog);
  const visits = useAppStore(state => state.visits);
  const add = useAppStore(state => state.addVisit);
  const remove = useAppStore(state => state.removeVisit);
  const complete = useAppStore(state => state.setVisitCompleted);
  const online = useAppStore(state => state.online);
  const lastSync = useAppStore(state => state.lastSync);
  const pull = useAppStore(state => state.pullUpdates);
  const syncing = useAppStore(state => state.syncing);
  const syncError = useAppStore(state => state.syncError);
  const [selecting, setSelecting] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const customers = useMemo(() => getVisitCustomers(catalog), [catalog]);
  const today = visits.filter(visit => visit.date === day && !catalog.customers.some(customer => customer.id === visit.customerId && !isPortfolioCustomer(customer)));
  const done = today.filter(visit => !!visit.completedAt).length;
  const run = (action: () => void) => { try { setError(''); action(); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível atualizar a agenda.'); } };
  const search = query.trim().toLocaleLowerCase('pt-BR');
  const digits = search.replace(/\D/g, '');
  const data = selecting ? customers.filter(customer => !search || `${customer.name} ${customer.city}`.toLocaleLowerCase('pt-BR').includes(search) || !!digits && catalog.customers.some(full => full.id === customer.id && full.cnpj.replace(/\D/g, '').includes(digits)))
    : today.map(visit => ({ id: visit.customerId, name: customers.find(customer => customer.id === visit.customerId)?.name ?? `Loja ${visit.customerId}`, city: customers.find(customer => customer.id === visit.customerId)?.city ?? 'Cadastro indisponível' }));
  return <View style={styles.page}>
    <View style={styles.header}>
      <View style={styles.row}><View style={{ flex: 1 }}><Text style={styles.title}>{selecting ? 'Adicionar lojas' : 'Sua agenda de hoje'}</Text><Text style={styles.meta}>{day.split('-').reverse().join('/')} · {done} de {today.length} concluídas</Text></View>
        <Pressable accessibilityRole="button" onPress={() => { setSelecting(!selecting); setQuery(''); }} style={styles.button}><Text style={styles.buttonText}>{selecting ? 'Pronto' : 'Adicionar'}</Text></Pressable>
      </View>
      <Text style={styles.hint}>Agenda salva neste aparelho. Consulte os dados do cliente antes de visitar.</Text>
      {!online ? <Banner text="Offline · a agenda e os dados salvos continuam disponíveis." /> : null}
      {error || syncError ? <Banner tone="danger" text={error || syncError!} /> : null}
      {selecting ? <TextInput accessibilityLabel="Buscar lojas para visitar" placeholder="Buscar nome, cidade ou CNPJ" value={query} onChangeText={setQuery} style={styles.input} /> :
        <View style={styles.row}><Text style={[styles.hint, { flex: 1 }]}>{lastSync ? `Dados de ${new Date(lastSync).toLocaleString('pt-BR')}` : 'Dados ainda não sincronizados'}</Text><Pressable accessibilityRole="button" disabled={!online || syncing} onPress={() => { void pull(); }} style={styles.action}><Text style={styles.link}>{syncing ? 'Atualizando…' : 'Atualizar'}</Text></Pressable></View>}
    </View>
    <FlatList data={data} keyExtractor={item => String(item.id)} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<View style={styles.empty}><AppIcon name={selecting ? 'search' : 'calendar'} size={32} color={colors.teal} /><Text style={styles.emptyTitle}>{selecting ? 'Nenhuma loja encontrada' : 'Prepare suas visitas'}</Text><Text style={styles.hint}>{selecting ? 'Tente outro termo ou sincronize a carteira.' : 'Toque em Adicionar para escolher as lojas que vai visitar hoje.'}</Text></View>}
      renderItem={({ item }) => {
        const visit = today.find(visit => visit.customerId === item.id);
        const families = catalog.goals.families.filter(family => family.semPositivar.some(pdv => pdv.id === item.id));
        const gap = catalog.goals.pdvsSemPositivar.some(pdv => pdv.id === item.id);
        return <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}><Text style={styles.customer}>{item.name}</Text><Text style={styles.meta}>{item.city}</Text></View>
            {selecting ? <Pressable accessibilityRole="button" accessibilityLabel={`${visit ? 'Remover' : 'Adicionar'} ${item.name} ${visit ? 'da' : 'à'} agenda de hoje`} onPress={() => run(() => visit ? remove(item.id, day) : add(item.id, day))} style={[styles.select, visit && styles.selected]}><AppIcon name={visit ? 'check' : 'plus'} size={20} color={visit ? colors.card : colors.teal} /></Pressable> : null}
          </View>
          {!selecting ? <>
            <Text style={[styles.state, visit?.completedAt && styles.completed]}>{visit?.completedAt ? 'Visita concluída' : 'Visita planejada'}{gap ? ' · sem faturamento no período' : ''}</Text>
            {families.length ? <Text style={styles.hint}>{families.length} {families.length === 1 ? 'família a positivar' : 'famílias a positivar'}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`Preparar visita a ${item.name}`} style={styles.details} onPress={() => router.push({ pathname: '/visita', params: { customerId: item.id } })}><Text style={styles.link}>Preparar visita</Text><AppIcon name="chevron-right" size={18} color={colors.teal} /></Pressable>
            <View style={styles.footer}><Pressable accessibilityRole="button" accessibilityLabel={`${visit?.completedAt ? 'Reabrir visita a' : 'Concluir visita a'} ${item.name}`} onPress={() => run(() => complete(item.id, day, !visit?.completedAt))} style={styles.action}><Text style={styles.link}>{visit?.completedAt ? 'Reabrir visita' : 'Concluir visita'}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item.name} da agenda de hoje`} onPress={() => run(() => remove(item.id, day))} style={styles.action}><Text style={styles.remove}>Remover</Text></Pressable></View>
          </> : null}
        </View>;
      }} />
  </View>;
}
export default withSession(VisitsScreen);
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page }, header: { padding: space.md, paddingBottom: 0 }, row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  title: { fontFamily: fonts.displayBold, color: colors.ink, fontSize: 22 }, meta: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, marginTop: 4 }, hint: { fontFamily: fonts.body, color: colors.muted, fontSize: 12, lineHeight: 18, marginVertical: 8 },
  button: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.ink, borderRadius: radius.md }, buttonText: { color: colors.onPrimary, fontFamily: fonts.bodyStrong, fontSize: 13 },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, color: colors.ink, fontFamily: fonts.body, marginBottom: 8 },
  list: { padding: space.md, gap: space.sm, paddingBottom: 32 }, card: { backgroundColor: colors.card, padding: space.md, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.lg },
  customer: { fontFamily: fonts.display, color: colors.ink, fontSize: 18 }, select: { height: 44, width: 44, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' }, selected: { backgroundColor: colors.teal },
  state: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 12, marginTop: 12 }, completed: { color: colors.success }, link: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 13 },
  details: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, marginTop: 8, backgroundColor: colors.greenSoft, paddingHorizontal: 12, borderRadius: radius.md },
  action: { minHeight: 44, justifyContent: 'center' }, footer: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 }, remove: { color: colors.muted, fontFamily: fonts.bodyStrong, fontSize: 12 },
  empty: { paddingVertical: 32, gap: 8, alignItems: 'center' }, emptyTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
});
