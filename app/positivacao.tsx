import { withSession } from '../src/components/require-session';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TabBar } from '../src/components/tabbar';
import { Card } from '../src/components/ui';
import { useAppStore } from '../src/data/store';
import type { PdvRef } from '../src/domain/types';
import { colors, fonts, radius, space } from '../src/theme';

function openOrder(customerId: number, createDraft: (customerId: number, tableId: number) => string) {
  const catalog = useAppStore.getState().catalog;
  const customer = catalog.customers.find((item) => item.id === customerId);
  if (!customer?.hasSalesArea || customer.tableIds.length === 0) {
    return;
  }
  const id = createDraft(customer.id, customer.tableIds[0]);
  router.push(`/pedido/${id}`);
}

function PdvCard({
  pdv,
  onOrder,
}: {
  pdv: PdvRef;
  onOrder: (id: number) => void;
}) {
  const catalog = useAppStore((state) => state.catalog);
  const canOrder = catalog.customers.some((item) => item.id === pdv.id && item.hasSalesArea && item.tableIds.length > 0);
  return (
    <View style={styles.pdvCard}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pdvName}>{pdv.name}</Text>
        <Text style={styles.city}>{pdv.city}</Text>
      </View>
      {canOrder ? (
        <Pressable accessibilityRole="button" style={styles.digitar} onPress={() => onOrder(pdv.id)}>
          <Text style={styles.digitarText}>Digitar</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function PositivacaoScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const createDraft = useAppStore((state) => state.createDraft);
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
        <View style={styles.switch}>
          <Pressable
            accessibilityRole="button"
            style={[styles.seg, panel === 'lojas' && styles.segOn]}
            onPress={() => setPanel('lojas')}
          >
            <Text style={[styles.segText, panel === 'lojas' && styles.segTextOn]}>Lojas</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.seg, panel === 'familias' && styles.segOn]}
            onPress={() => setPanel('familias')}
          >
            <Text style={[styles.segText, panel === 'familias' && styles.segTextOn]}>Famílias</Text>
          </Pressable>
        </View>

        {panel === 'lojas' ? (
          <>
            <Card>
              <View style={styles.ratio}>
                <Text style={styles.ratioLeft}>{semPositivar}</Text>
                <Text style={styles.ratioSlash}>/</Text>
                <Text style={styles.ratioRight}>{total}</Text>
              </View>
              <Text style={styles.ratioHint}>sem positivar · {goals.periodLabel}</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${coverage}%` }]} />
              </View>
            </Card>
            {goals.pdvsSemPositivar.map((pdv) => (
              <PdvCard key={pdv.id} pdv={pdv} onOrder={(id) => openOrder(id, createDraft)} />
            ))}
          </>
        ) : null}

        {panel === 'familias'
          ? goals.families.map((family) => {
          const pct = Math.round((family.faturados / family.metaPdvs) * 100);
          const open = familyOpen === family.family;
          return (
            <View key={family.family} style={{ marginTop: space.sm }}>
              <Card>
                <Pressable accessibilityRole="button" onPress={() => setFamilyOpen(open ? null : family.family)}>
                  <View style={styles.familyHead}>
                    <Text style={styles.count}>{family.semPositivar.length}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.familyName}>{family.family}</Text>
                      <Text style={styles.city}>
                        {family.faturados}/{family.metaPdvs}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${Math.min(pct, 100)}%` }]} />
                  </View>
                </Pressable>
                {open
                  ? family.semPositivar.map((pdv) => (
                      <PdvCard key={pdv.id} pdv={pdv} onOrder={(id) => openOrder(id, createDraft)} />
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
  ratio: { flexDirection: 'row', alignItems: 'flex-end' },
  ratioLeft: { fontFamily: fonts.displayBold, fontSize: 48, color: colors.ink, lineHeight: 52 },
  ratioSlash: { fontFamily: fonts.display, fontSize: 28, color: colors.muted, marginHorizontal: 4, marginBottom: 6 },
  ratioRight: { fontFamily: fonts.displayBold, fontSize: 32, color: colors.muted, marginBottom: 4 },
  ratioHint: { marginTop: 4, color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 13 },
  hero: { fontSize: 48, fontFamily: fonts.displayBold, color: colors.ink },
  switch: {
    flexDirection: 'row',
    backgroundColor: colors.lineSoft,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: space.md,
  },
  seg: { flex: 1, minHeight: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.card },
  segText: { fontFamily: fonts.bodyStrong, color: colors.muted, fontSize: 15 },
  segTextOn: { color: colors.ink },
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
  count: { fontFamily: fonts.displayBold, fontSize: 28, color: colors.ink, minWidth: 36 },
  familyName: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  track: { height: 8, backgroundColor: colors.lineSoft, borderRadius: 99, marginTop: 12, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.teal },
});

export default withSession(PositivacaoScreen);
