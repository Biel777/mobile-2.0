import { filterPortfolioRefs } from '../src/domain/portfolio';
import { AppIcon } from '../src/components/icons';
import { withSession } from '../src/components/require-session';
import { startOrderForPdv } from '../src/data/order-entry';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TabBar } from '../src/components/tabbar';
import { Card } from '../src/components/ui';
import { useAppStore } from '../src/data/store';
import type { PdvRef } from '../src/domain/types';
import { colors, fonts, radius, space } from '../src/theme';

function PdvCard({
  pdv,
  onOrder,
}: {
  pdv: PdvRef;
  onOrder: (pdv: PdvRef) => void;
}) {
  return (
    <View style={styles.pdvCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pdvName}>{pdv.name}</Text>
        <Text style={styles.city}>{pdv.city}</Text>
      </View>
        <Pressable accessibilityRole="button" style={styles.digitar} accessibilityLabel={`Digitar pedido para ${pdv.name}`} onPress={() => onOrder(pdv)}>
          <Text style={styles.digitarText}>Digitar</Text>
        </Pressable>
    </View>
  );
}

function PositivacaoScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const goals = catalog.goals;
  const [familyOpen, setFamilyOpen] = useState<string | null>(null);
  const [panel, setPanel] = useState<'lojas' | 'familias'>('lojas');
  const total = goals.pdvsCarteira;
  const positivados = goals.pdvsPositivados;
  const semPositivar = total - positivados;
  const coverage = total > 0 ? Math.round((positivados / total) * 100) : 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.switch} accessibilityRole="tablist" accessibilityLabel="Visualizar positivação por">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: panel === 'lojas' }}
            style={[styles.seg, panel === 'lojas' && styles.segOn]}
            onPress={() => setPanel('lojas')}
          >
            <Text style={[styles.segText, panel === 'lojas' && styles.segTextOn]}>Lojas</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: panel === 'familias' }}
            style={[styles.seg, panel === 'familias' && styles.segOn]}
            onPress={() => setPanel('familias')}
          >
            <Text style={[styles.segText, panel === 'familias' && styles.segTextOn]}>Famílias</Text>
          </Pressable>
        </View>

        {panel === 'lojas' ? (
          <>
            <Card>
              <View style={styles.summaryHeader}>
                <Text style={styles.kicker}>Sem positivar</Text>
                <Text style={styles.period}>{goals.periodLabel}</Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metric}>{semPositivar}</Text>
                <Text style={styles.metricUnit}>{semPositivar === 1 ? 'loja sem faturamento' : 'lojas sem faturamento'}</Text>
              </View>
              <Text style={styles.summaryMeta}>{positivados} positivadas · {total} lojas na carteira</Text>
              <View style={styles.coverageRow}>
                <View style={styles.coverageTrack}>
                  <View style={[styles.fill, { width: `${Math.max(0, Math.min(coverage, 100))}%` }]} />
                </View>
                <Text style={styles.coverage}>{coverage}%</Text>
              </View>
            </Card>
            {filterPortfolioRefs(goals.pdvsSemPositivar, catalog.customers).map((pdv) => (
              <PdvCard key={pdv.id} pdv={pdv} onOrder={startOrderForPdv} />
            ))}
          </>
        ) : null}

        {panel === 'familias'
          ? goals.families.map((family) => {
          const visibleMissing = filterPortfolioRefs(family.semPositivar, catalog.customers);
          const pct = family.metaPdvs > 0 ? Math.round((family.faturados / family.metaPdvs) * 100) : 0;
          const open = familyOpen === family.family;
          return (
            <View key={family.family} style={{ marginTop: space.sm }}>
              <Card>
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${family.family}, ${family.faturados} de ${family.metaPdvs} lojas positivadas. ${open ? 'Recolher' : 'Ver'} lojas sem positivar.`} style={styles.familyAction} onPress={() => setFamilyOpen(open ? null : family.family)}>
                  <View style={styles.familyHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.familyName}>{family.family}</Text>
                      <Text style={styles.city}>
                        {family.faturados} de {family.metaPdvs} lojas positivadas
                      </Text>
                    </View>
                    <AppIcon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.teal} />
                  </View>
                  <View style={styles.familyFoot}>
                    <Text style={styles.familyPending}>{visibleMissing.length} sem positivar</Text>
                    <Text style={styles.coverage}>{pct}%</Text>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.min(pct, 100)}%` }]} />
                  </View>
                </Pressable>
                {open
                  ? visibleMissing.map((pdv) => (
                      <PdvCard key={pdv.id} pdv={pdv} onOrder={startOrderForPdv} />
                    ))
                  : null}
              </Card>
            </View>
          );
        })
          : null}
      </ScrollView>
      <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, paddingBottom: 24 },
  kicker: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 12, textTransform: 'uppercase' },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space.xs },
  period: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.sm },
  metric: { fontFamily: fonts.displayBold, fontSize: 36, lineHeight: 42, color: colors.ink },
  metricUnit: { flex: 1, color: colors.ink, fontFamily: fonts.bodyStrong, fontSize: 14, lineHeight: 20 },
  summaryMeta: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 2 },
  coverageRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  coverageTrack: { flex: 1, height: 6, borderRadius: radius.full, backgroundColor: colors.lineSoft, overflow: 'hidden' },
  coverage: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 11 },
  switch: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  seg: { flex: 1, minHeight: 44, borderRadius: radius.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.sm },
  segOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  segText: { fontFamily: fonts.bodyStrong, color: colors.text, fontSize: 14 },
  segTextOn: { color: colors.onPrimary },
  pdvCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: space.md,
    marginTop: space.sm,
    minHeight: 72,
  },
  pdvName: { fontFamily: fonts.bodyStrong, fontSize: 16, color: colors.ink },
  city: { color: colors.muted, fontFamily: fonts.body, marginTop: 2 },
  digitar: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitarText: { color: colors.onPrimary, fontFamily: fonts.bodyStrong, fontSize: 14 },
  familyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  familyAction: { minHeight: 44 },
  familyFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  familyPending: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 12 },
  familyName: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  track: { height: 8, backgroundColor: colors.lineSoft, borderRadius: 99, marginTop: 12, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.teal },
});

export default withSession(PositivacaoScreen);
