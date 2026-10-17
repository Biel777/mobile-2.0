import { withSession } from '../src/components/require-session';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TabBar } from '../src/components/tabbar';
import { Banner, Card } from '../src/components/ui';
import { useAppStore } from '../src/data/store';
import { gap, money } from '../src/domain/pricing';
import { statusLabel } from '../src/domain/status';
import type { FlagGoal } from '../src/domain/types';
import { colors, fonts, space } from '../src/theme';

function openFamilies(flag: FlagGoal) {
  return flag.families.filter((item) => item.billedNet < item.minNet);
}

function BandeiraScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const tracked = useAppStore((state) => state.tracked);
  const flags = catalog.flags;
  const waiting = tracked.filter((order) => order.status === 14);
  const openCount = flags.reduce((sum, flag) => sum + openFamilies(flag).length, 0);
  const [openName, setOpenName] = useState<string | null>(flags[0]?.name ?? null);

  if (catalog.unsupportedFeatures?.includes('flags')) return <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}><Banner text="As metas de bandeira ainda não estão disponíveis nesta integração. O contrato precisa ser confirmado com o Sales API." /></ScrollView><TabBar />
  </View>;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Famílias abaixo do mínimo</Text>
        <Text style={styles.hero}>{openCount}</Text>
        <Text style={styles.meta}>em {flags.length} bandeiras · toque na bandeira para ver cada família</Text>

        {flags.map((flag) => {
          const missing = gap(flag.minNet, flag.billedNet);
          const families = openFamilies(flag);
          const expanded = openName === flag.name;
          const pct = flag.minNet > 0 ? Math.min(100, Math.round((flag.billedNet / flag.minNet) * 100)) : 0;
          return (
            <View key={flag.name} style={{ marginTop: space.sm }}>
              <Card>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setOpenName(expanded ? null : flag.name)}
                >
                  <Text style={styles.name}>{flag.name}</Text>
                  <Text style={styles.gapLine}>
                    {missing > 0 ? `Faltam ${money(missing)} da cesta` : 'Cesta do mês atingida'}
                  </Text>
                  <Text style={styles.meta}>
                    {money(flag.billedNet)} de {money(flag.minNet)} · {families.length}{' '}
                    {families.length === 1 ? 'família abaixo' : 'famílias abaixo'}
                  </Text>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.link}>{expanded ? 'Fechar famílias' : 'Ver mínimos da família'}</Text>
                </Pressable>
                {expanded
                  ? flag.families.map((family) => {
                      const left = gap(family.minNet, family.billedNet);
                      const familyPct =
                        family.minNet > 0 ? Math.min(100, Math.round((family.billedNet / family.minNet) * 100)) : 0;
                      return (
                        <View key={family.family} style={styles.family}>
                          <Text style={styles.familyName}>{family.family}</Text>
                          <Text style={styles.gapLine}>
                            {left > 0 ? `Faltam ${money(left)}` : 'Mínimo atingido'}
                          </Text>
                          <Text style={styles.meta}>
                            {money(family.billedNet)} de {money(family.minNet)}
                          </Text>
                          <View style={styles.track}>
                            <View style={[styles.fillTeal, { width: `${familyPct}%` }]} />
                          </View>
                        </View>
                      );
                    })
                  : null}
              </Card>
            </View>
          );
        })}

        <Text style={styles.section}>Pedidos aguardando a cesta</Text>
        {waiting.length === 0 ? <Text style={styles.meta}>Nenhum pedido parado na bandeira.</Text> : null}
        {waiting.map((order) => (
          <Pressable key={order.id} onPress={() => router.push(`/pedidos/${order.id}`)}>
            <View style={{ marginBottom: space.sm }}>
              <Card>
                <Text style={styles.name}>Pedido {order.id}</Text>
                <Text style={styles.meta}>
                  {order.customerName} · {statusLabel(order.status)}
                </Text>
              </Card>
            </View>
          </Pressable>
        ))}
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
  section: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginTop: space.lg, marginBottom: space.sm },
  name: { fontFamily: fonts.display, color: colors.ink, fontSize: 16 },
  familyName: { fontFamily: fonts.bodyStrong, color: colors.ink, fontSize: 15 },
  gapLine: { fontFamily: fonts.displayBold, color: colors.ink, fontSize: 18, marginTop: 4 },
  meta: { color: colors.text, fontFamily: fonts.body, marginTop: 4 },
  link: { color: colors.teal, fontFamily: fonts.bodyStrong, marginTop: 10 },
  family: { marginTop: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  track: { height: 8, backgroundColor: colors.lineSoft, borderRadius: 99, marginTop: 10, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.yellow },
  fillTeal: { height: 8, backgroundColor: colors.teal },
});

export default withSession(BandeiraScreen);
