import { AppIcon } from './icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '@bff/cases/sales';
import { isAttention, isUnread } from '@bff/cases/sales';
import { colors, fonts, radius, space } from '../theme';

export function updateTime(at: string) {
  return new Date(at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function OrderUpdatesSummary() {
  const updates = useAppStore(state => state.orderUpdates);
  const attention = updates.filter(isAttention).length;
  const unread = updates.filter(item => !isAttention(item) && isUnread(item)).length;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Atualizações dos pedidos. ${attention} precisam de atenção. ${unread} outras novidades.`}
      onPress={() => router.push('/atualizacoes')} style={styles.summary}>
      <View style={styles.row}><Text style={styles.heading}>Seus pedidos</Text><View style={styles.row}><Text style={styles.link}>Ver central</Text><AppIcon name="chevron-right" size={16} color={colors.teal} /></View></View>
      <View style={styles.countRow}>
        <View style={styles.countGroup}><Text style={[styles.count, attention > 0 && styles.warning]}>{attention}</Text><Text style={styles.caption}>precisam de atenção</Text></View>
        <View style={styles.divider} />
        <View style={styles.countGroup}><Text style={styles.count}>{unread}</Text><Text style={styles.caption}>outras novidades</Text></View>
      </View>
    </Pressable>
  );
}

export function OrderUpdateHistory({ orderId, localOrderId }: { orderId?: number; localOrderId?: string }) {
  const update = useAppStore(state => state.orderUpdates.find(item => orderId !== undefined ? item.orderId === orderId : item.localOrderId === localOrderId));
  const markRead = useAppStore(state => state.markOrderUpdateRead);
  const review = useAppStore(state => state.reviewOrderUpdate);
  const [expanded, setExpanded] = useState(false);
  const updateKey = update?.key;
  const fingerprint = update?.fingerprint;
  useEffect(() => { if (updateKey) markRead(updateKey); }, [updateKey, fingerprint, markRead]);
  if (!update) return null;
  return <View style={styles.history}>
    {isAttention(update) ? <View style={styles.attentionBox}>
      <Text style={styles.heading}>Precisa de atenção</Text>
      <Text style={styles.body}>{update.summary}</Text>
      <Pressable accessibilityRole="button" onPress={() => review(update.key)} style={styles.action}><Text style={styles.link}>Marcar como revisado</Text></Pressable>
    </View> : null}
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)} style={styles.toggle}>
      <Text style={styles.heading}>Histórico de atualizações</Text><Text style={styles.link}>{expanded ? 'Ocultar' : 'Ver'}</Text>
    </Pressable>
    {expanded ? <View><Text style={styles.caption}>Horários em que as mudanças foram identificadas no app.</Text>
      {update.events.map(event => <View key={event.id} style={styles.event}>
        <Text style={styles.heading}>{event.title}</Text><Text style={styles.body}>{event.summary}</Text><Text style={styles.caption}>{updateTime(event.at)}</Text>
      </View>)}
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  summary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.lg, padding: space.md, marginTop: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { fontFamily: fonts.bodyStrong, color: colors.ink, fontSize: 14 },
  link: { fontFamily: fonts.bodyStrong, color: colors.teal, fontSize: 13 },
  countRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 },
  countGroup: { flex: 1, minWidth: 0 }, count: { fontFamily: fonts.displayBold, fontSize: 24, color: colors.ink },
  warning: { color: colors.danger }, caption: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 3 },
  divider: { width: 1, height: 32, backgroundColor: colors.lineSoft },
  history: { marginTop: space.md }, toggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  event: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.lineSoft, gap: 4 },
  body: { fontFamily: fonts.body, fontSize: 13, color: colors.text, lineHeight: 19 },
  attentionBox: { backgroundColor: colors.warnBg, borderRadius: radius.md, padding: 12, gap: 6 },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
