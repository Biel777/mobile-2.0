import { filterPortfolioRefs } from '@bff/cases/sales';
import { VisitsSummary } from '@components/visits';
import { OrderUpdatesSummary } from '@components/order-updates';
import { startOrderForPdv } from '@bff/cases/sales';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppStore } from '@bff/cases/sales';
import { attainment, gap, moneyShort } from '@bff/cases/sales';
import { TabBar } from '@components/tabbar';
import { Banner, BigNumber, Card, PrimaryButton } from '@components/ui';
import { colors, fonts, radius, space } from '../src/theme';

export default function HomeScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const syncing = useAppStore((state) => state.syncing);
  const authRequired = useAppStore((state) => state.authRequired);
  const session = useAppStore((state) => state.session);
  const online = useAppStore((state) => state.online);
  const lastSync = useAppStore((state) => state.lastSync);
  const orders = useAppStore((state) => state.orders);
  const login = useAppStore((state) => state.login);
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!session || (authRequired && online)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.login}>
          <Text style={styles.kicker}>Força de vendas</Text>
          <Text style={styles.title}>Entrar para digitar pedidos</Text>
          <Text style={styles.sub}>
            Após sincronizar, você pode digitar offline. Na web, entre novamente após recarregar
            para enviar pedidos.
          </Text>
          {error ? <Banner tone="danger" text={error} /> : null}
          <TextInput
            value={user}
            onChangeText={setUser}
            style={styles.input}
            placeholder="Login"
            autoCapitalize="none"
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            placeholder="Senha"
            secureTextEntry
          />
          <PrimaryButton
            title={syncing ? 'Entrando…' : 'Entrar'}
            disabled={syncing || !online}
            onPress={() => {
              setError('');
              login(user, password).catch((err) => setError(err.message));
            }}
          />
        </View>
      </SafeAreaView>
    );
  }

  const goals = catalog.goals;
  const pct = attainment(goals.metaValor, goals.realizadoValor);
  const missing = gap(goals.metaValor, goals.realizadoValor);
  const queued = orders.filter(
    (order) => order.queueStatus === 'pending' || order.queueStatus === 'failed',
  ).length;
  const pdvGap = filterPortfolioRefs(goals.pdvsSemPositivar, catalog.customers);

  const openFamilies = catalog.flags.reduce(
    (sum, flag) => sum + flag.families.filter((item) => item.billedNet < item.minNet).length,
    0,
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {!online ? (
          <Banner text="Você está offline. Pedidos ficam na fila e saem ao reconectar." />
        ) : null}
        {queued > 0 ? (
          <Pressable onPress={() => router.push('/pedidos')}>
            <View style={{ marginBottom: space.sm }}>
              <Banner tone="good" text={`${queued} pedido(s) na fila. Toque para enviar.`} />
            </View>
          </Pressable>
        ) : null}
        <Text style={styles.kicker}>
          {catalog.user.area ? `Área ${catalog.user.area}` : 'Carteira'} · {goals.periodLabel}
        </Text>
        <Text style={styles.title}>Olá, {session.name.split(' ')[0]}</Text>
        <Text style={styles.sync}>
          {lastSync
            ? `Atualizado às ${new Date(lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : 'Sem sincronização'}
        </Text>

        <VisitsSummary />

        <Pressable onPress={() => router.push('/metas')}>
          <Card>
            <Text style={styles.heroLabel}>Falta no ciclo</Text>
            <Text style={styles.hero}>{moneyShort(missing)}</Text>
            <Text style={styles.heroHint}>{pct}% da meta · toque para o detalhe</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.min(pct, 100)}%` }]} />
            </View>
            <View style={styles.split}>
              <BigNumber label="Meta" value={moneyShort(goals.metaValor)} />
              <BigNumber label="Faturado" value={moneyShort(goals.realizadoValor)} />
            </View>
          </Card>
        </Pressable>

        <OrderUpdatesSummary />

        <Pressable onPress={() => router.push('/bandeira')} style={{ marginTop: space.sm }}>
          <Card>
            <Text style={styles.heroLabel}>
              {catalog.unsupportedFeatures?.includes('flags') ? 'Bandeiras' : 'Mínimos em aberto'}
            </Text>
            {!catalog.unsupportedFeatures?.includes('flags') ? (
              <Text style={styles.flagCount}>{openFamilies}</Text>
            ) : null}
            <Text style={styles.heroHint}>
              {catalog.unsupportedFeatures?.includes('flags')
                ? 'Dados indisponíveis nesta integração'
                : `em ${catalog.flags.length} bandeiras · toque para ver cada família`}
            </Text>
          </Card>
        </Pressable>

        <Text style={styles.section}>
          {pdvGap.length} PDV{pdvGap.length === 1 ? '' : 's'} sem faturamento
        </Text>
        {pdvGap.map((pdv) => {
          return (
            <View key={pdv.id} style={styles.pdvRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pdvName}>{pdv.name}</Text>
                <Text style={styles.pdvCity}>{pdv.city}</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.digitar}
                accessibilityLabel={`Digitar pedido para ${pdv.name}`}
                onPress={() => startOrderForPdv(pdv)}
              >
                <Text style={styles.digitarText}>Digitar</Text>
              </Pressable>
            </View>
          );
        })}
        <Pressable
          accessibilityRole="button"
          style={styles.more}
          onPress={() => router.push('/positivacao')}
        >
          <Text style={styles.moreText}>Ver famílias</Text>
        </Pressable>
      </ScrollView>
      <TabBar />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.lg, paddingBottom: 48 },
  login: {
    flex: 1,
    padding: space.lg,
    justifyContent: 'center',
    gap: 12,
    backgroundColor: colors.page,
  },
  kicker: {
    color: colors.teal,
    fontFamily: fonts.bodyStrong,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 12,
  },
  title: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.ink, marginTop: 2 },
  sub: { color: colors.text, fontFamily: fonts.body, fontSize: 15 },
  sync: {
    color: colors.muted,
    fontFamily: fonts.body,
    fontSize: 12,
    marginTop: 6,
    marginBottom: space.md,
  },
  section: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.ink,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  pdvRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: space.md,
    marginBottom: space.sm,
  },
  pdvName: { fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  pdvCity: { color: colors.muted, fontFamily: fonts.body, marginTop: 2 },
  digitar: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitarText: { color: colors.onPrimary, fontFamily: fonts.bodyStrong, fontSize: 14 },
  more: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  moreText: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 15 },
  heroLabel: {
    color: colors.teal,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  hero: { fontFamily: fonts.displayBold, fontSize: 48, color: colors.ink, marginTop: 2 },
  flagCount: { fontFamily: fonts.displayBold, fontSize: 40, color: colors.ink, marginTop: 2 },
  heroHint: { color: colors.text, fontFamily: fonts.body, marginTop: 2 },
  split: { flexDirection: 'row', gap: 12, marginTop: space.md },
  barTrack: {
    height: 8,
    backgroundColor: colors.lineSoft,
    borderRadius: 99,
    marginTop: 14,
    overflow: 'hidden',
  },
  barFill: { height: 8, backgroundColor: colors.yellow },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.ink,
  },
});
