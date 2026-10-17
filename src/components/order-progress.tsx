import { AppIcon } from './icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getOrderProgress } from '../domain/order-progress';
import type { TrackedOrder } from '../domain/types';
import { colors, fonts, radius, space } from '../theme';
import { statusLabel } from '../domain/status';

export function OrderProgress({ order }: { order: TrackedOrder }) {
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const expanded = expandedOrderId === order.id;
  const progress = getOrderProgress(order);
  const caution = progress.severity === 'warning' || progress.severity === 'error';
  const interrupted = [3, 6, 9, 11, 12, 13, 14, 15, 16].includes(order.status);
  const title = progress.completed
    ? (progress.severity === 'warning' ? 'Faturado parcial' : 'Pedido faturado')
    : interrupted ? statusLabel(order.status) : progress.steps[progress.currentIndex].label;
  return <View style={styles.card}>
    <Pressable style={styles.summary} accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`${title}. Etapa ${progress.currentIndex + 1} de ${progress.steps.length}. ${expanded ? 'Ocultar' : 'Ver'} etapas do pedido.`}
      onPress={() => setExpandedOrderId(expanded ? null : order.id)}>
      <View style={styles.header}>
        <Text style={[styles.title, caution && styles.warningTitle]}>{title}</Text>
        <Text style={styles.counter}>{progress.currentIndex + 1}/{progress.steps.length}</Text>
      </View>
      <View style={styles.overview}>
        <View style={styles.segments} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {progress.steps.map(step => <View key={step.label} style={[styles.segment,
            step.state === 'completed' && styles.segmentDone,
            step.state === 'current' && styles.segmentActive]} />)}
        </View>
        <View style={styles.toggleRow}><Text style={styles.toggle}>{expanded ? 'Ocultar etapas' : 'Ver etapas'}</Text><AppIcon name={expanded ? 'chevron-up' : 'chevron-down'} color={colors.teal} size={14} /></View>
      </View>
    </Pressable>
    {expanded ? <View style={styles.expanded}>
    <View style={styles.steps}>
      {progress.steps.map((step, index) => {
        const done = step.state === 'completed';
        const active = step.state === 'current';
        const stateLabel = done ? 'Concluída' : active ? 'Etapa atual' : 'Próxima etapa';
        return <View key={step.label} style={styles.step} accessible
          accessibilityLabel={`${index + 1}. ${step.label}. ${stateLabel}`}>
          <View style={styles.rail} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <View style={[styles.circle, done && styles.circleDone, active && styles.circleActive]}>
              {done ? <AppIcon name="check" color={colors.card} size={16} /> : <Text style={[styles.number, active && styles.numberActive]}>{index + 1}</Text>}
            </View>
            {index < progress.steps.length - 1 ? <View style={[styles.connector, done && styles.connectorDone]} /> : null}
          </View>
          <View style={[styles.stepContent, index === progress.steps.length - 1 && styles.lastContent]}>
            <Text style={[styles.stepLabel, done && styles.doneLabel, active && styles.activeLabel]}>{step.label}</Text>
            {active ? <Text style={[styles.currentBadge, caution && styles.cautionBadge]}>Agora</Text> : null}
          </View>
        </View>;
      })}
    </View>
    <View style={[styles.note, caution && styles.cautionNote, progress.severity === 'error' && styles.errorNote]}>
      <Text style={[styles.noteText, caution && styles.cautionText, progress.severity === 'error' && styles.errorText]}>{progress.note}</Text>
    </View>
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.lg, backgroundColor: colors.card },
  summary: { minHeight: 64, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  title: { flex: 1, minWidth: 0, color: colors.ink, fontFamily: fonts.bodyStrong, fontSize: 13, lineHeight: 18 },
  warningTitle: { color: colors.warn },
  overview: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  segments: { flex: 1, flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 4, borderRadius: radius.full, backgroundColor: colors.lineSoft },
  segmentDone: { backgroundColor: colors.teal },
  segmentActive: { backgroundColor: colors.mint, borderWidth: 1, borderColor: colors.teal },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  toggle: { fontFamily: fonts.bodyStrong, fontSize: 11, color: colors.teal },
  expanded: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  counter: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 11 },
  steps: { marginTop: space.md },
  step: { flexDirection: 'row', gap: space.sm },
  rail: { width: 26, alignItems: 'center' },
  circle: { width: 26, height: 26, borderRadius: radius.full, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.page, alignItems: 'center', justifyContent: 'center' },
  circleDone: { backgroundColor: colors.teal, borderColor: colors.teal },
  circleActive: { backgroundColor: colors.mint, borderColor: colors.teal, borderWidth: 2 },
  number: { color: colors.muted, fontFamily: fonts.bodyStrong, fontSize: 11 },
  numberActive: { color: colors.tealPressed },
  connector: { width: 2, minHeight: 12, flex: 1, backgroundColor: colors.lineSoft },
  connectorDone: { backgroundColor: colors.teal },
  stepContent: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, paddingTop: 4, paddingBottom: 16 },
  lastContent: { paddingBottom: 0 },
  stepLabel: { flex: 1, color: colors.muted, fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  doneLabel: { color: colors.text },
  activeLabel: { color: colors.ink, fontFamily: fonts.bodyStrong },
  currentBadge: { color: colors.tealPressed, backgroundColor: colors.mint, borderRadius: radius.sm, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2, fontFamily: fonts.bodyStrong, fontSize: 10 },
  cautionBadge: { color: colors.warn, backgroundColor: colors.warnBg },
  note: { backgroundColor: colors.greenSoft, padding: space.sm, borderRadius: radius.md, marginTop: space.md },
  noteText: { color: colors.tealPressed, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  cautionNote: { backgroundColor: colors.warnBg },
  cautionText: { color: colors.warn },
  errorNote: { backgroundColor: colors.dangerBg },
  errorText: { color: colors.danger },
});
