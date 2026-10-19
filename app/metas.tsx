import { withSession } from '@components/require-session';
import { useAppStore } from '@bff/cases/sales';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { TabBar } from '@components/tabbar';
import { BigNumber, Card, PrimaryButton } from '@components/ui';
import { attainment, gap, money, moneyShort } from '@bff/cases/sales';
import { colors, fonts, space } from '../src/theme';

function MetasScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const goals = catalog.goals;
  const pct = attainment(goals.metaValor, goals.realizadoValor);
  const missing = gap(goals.metaValor, goals.realizadoValor);
  const qtyPct = attainment(goals.metaQtd, goals.realizadoQtd);
  const qtyMissing = gap(goals.metaQtd, goals.realizadoQtd);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Falta no ciclo · {goals.periodLabel}</Text>
        <Text style={styles.hero}>{moneyShort(missing)}</Text>
        <Text style={styles.meta}>{pct}% de {money(goals.metaValor)}</Text>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(pct, 100)}%` }]} />
        </View>
        <View style={styles.split}>
          <Card>
            <BigNumber label="Meta" value={moneyShort(goals.metaValor)} />
          </Card>
          <Card>
            <BigNumber label="Faturado" value={moneyShort(goals.realizadoValor)} />
          </Card>
        </View>
        <View style={{ height: space.sm }} />
        <Card>
          <Text style={styles.name}>Faltam {qtyMissing} unidades</Text>
          <Text style={styles.meta}>
            {goals.realizadoQtd} de {goals.metaQtd} · {qtyPct}%
          </Text>
          <View style={styles.track}>
            <View style={[styles.fillTeal, { width: `${Math.min(qtyPct, 100)}%` }]} />
          </View>
        </Card>
        <View style={{ height: space.md }} />
        <PrimaryButton title="Ver PDVs sem positivar" onPress={() => router.push('/positivacao')} />
      </ScrollView>
      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, paddingBottom: 24 },
  kicker: { color: colors.teal, fontFamily: fonts.bodyStrong },
  hero: { fontSize: 40, fontFamily: fonts.displayBold, color: colors.ink, marginTop: 4 },
  meta: { color: colors.text, fontFamily: fonts.body, marginTop: 4 },
  name: { fontFamily: fonts.display, color: colors.ink, fontSize: 18 },
  split: { flexDirection: 'row', gap: 8, marginTop: space.md },
  track: { height: 8, backgroundColor: colors.lineSoft, borderRadius: 99, marginTop: 12, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.yellow },
  fillTeal: { height: 8, backgroundColor: colors.teal },
});

export default withSession(MetasScreen);
