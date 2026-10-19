import { AppIcon } from '@components/icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { withSession } from '@components/require-session';
import { Banner } from '@components/ui';
import { updateTime } from '@components/order-updates';
import { useAppStore } from '@bff/cases/sales';
import type { OrderUpdate } from '@bff/contract';
import { isAttention, isUnread } from '@bff/cases/sales';
import { colors, fonts, radius, space } from '../src/theme';

function UpdatesScreen() {
  const updates = useAppStore((state) => state.orderUpdates);
  const tracked = useAppStore((state) => state.tracked);
  const markRead = useAppStore((state) => state.markOrderUpdateRead);
  const markAllRead = useAppStore((state) => state.markAllOrderUpdatesRead);
  const review = useAppStore((state) => state.reviewOrderUpdate);
  const online = useAppStore((state) => state.online);
  const syncing = useAppStore((state) => state.syncing);
  const error = useAppStore((state) => state.syncError);
  const pull = useAppStore((state) => state.pullUpdates);
  const [tab, setTab] = useState<'attention' | 'updates'>(
    updates.some(isAttention) ? 'attention' : 'updates',
  );
  const attentionCount = updates.filter(isAttention).length;
  const news = updates.filter((item) => !isAttention(item));
  const unread = news.filter(isUnread).length;
  const data = (tab === 'attention' ? updates.filter(isAttention) : news)
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at));
  const open = (item: OrderUpdate) => {
    markRead(item.key);
    if (item.orderId && tracked.some((order) => order.id === item.orderId))
      router.push(`/pedidos/${item.orderId}`);
    else if (item.localOrderId) router.push(`/pedido/${item.localOrderId}`);
  };
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        {!online ? <Banner text="Offline · mostrando atualizações salvas." /> : null}
        {error ? <Banner tone="danger" text={error} /> : null}
        <View style={styles.tabs} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'attention' }}
            onPress={() => setTab('attention')}
            style={[styles.tab, tab === 'attention' && styles.selected]}
          >
            <Text style={[styles.tabText, tab === 'attention' && styles.selectedText]}>
              Precisam de atenção ({attentionCount})
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === 'updates' }}
            onPress={() => setTab('updates')}
            style={[styles.tab, tab === 'updates' && styles.selected]}
          >
            <Text style={[styles.tabText, tab === 'updates' && styles.selectedText]}>
              Atualizações{unread ? ` (${unread})` : ''}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>
          {tab === 'attention'
            ? 'Abrir não remove a pendência. Revise o pedido para dispensar este aviso.'
            : 'Um resumo por pedido. Os horários indicam quando o app identificou a mudança.'}
        </Text>
        {tab === 'updates' && unread > 0 ? (
          <Pressable accessibilityRole="button" style={styles.action} onPress={markAllRead}>
            <Text style={styles.link}>Marcar atualizações como lidas</Text>
          </Pressable>
        ) : null}
      </View>
      <FlatList
        data={data}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.list}
        refreshing={syncing}
        onRefresh={
          online
            ? () => {
                void pull();
              }
            : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {tab === 'attention' ? 'Tudo em dia' : 'Sem atualizações'}
            </Text>
            <Text style={styles.hint}>
              {tab === 'attention'
                ? 'Nenhum pedido precisa de revisão no momento.'
                : 'As novidades dos pedidos aparecerão aqui após sincronizar.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir ${item.orderId ? `pedido ${item.orderId}` : 'pedido local'} de ${item.customerName}. ${item.title}${isUnread(item) ? '. Não lido' : ''}`}
              onPress={() => open(item)}
              style={styles.open}
            >
              <View style={styles.row}>
                <Text style={styles.order}>
                  {item.orderId ? `Pedido ${item.orderId}` : 'Pedido local'}
                </Text>
                {isUnread(item) ? <Text style={styles.unread}>Novo</Text> : null}
              </View>
              <Text style={styles.customer}>{item.customerName}</Text>
              <Text style={[styles.status, isAttention(item) && styles.warning]}>{item.title}</Text>
              <Text style={styles.body}>{item.summary}</Text>
              <View style={styles.row}>
                <Text style={styles.time}>{updateTime(item.at)}</Text>
                <View style={styles.row}>
                  <Text style={styles.link}>Ver pedido</Text>
                  <AppIcon name="chevron-right" size={16} color={colors.teal} />
                </View>
              </View>
            </Pressable>
            {isAttention(item) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Marcar pedido ${item.orderId ?? 'local'} como revisado`}
                onPress={() => review(item.key)}
                style={styles.review}
              >
                <Text style={styles.link}>Marcar como revisado</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}
export default withSession(UpdatesScreen);
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  header: { paddingHorizontal: space.md, paddingTop: space.md },
  tabs: { flexDirection: 'row', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  tab: {
    flex: 1,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  selected: { borderBottomColor: colors.teal },
  tabText: { fontFamily: fonts.bodyStrong, fontSize: 13, color: colors.muted, textAlign: 'center' },
  selectedText: { color: colors.ink },
  hint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 10,
  },
  action: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-end' },
  link: { fontFamily: fonts.bodyStrong, color: colors.teal, fontSize: 13 },
  list: { padding: space.md, paddingBottom: 40, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    overflow: 'hidden',
  },
  open: { padding: space.md, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  order: { fontFamily: fonts.bodyStrong, fontSize: 12, color: colors.teal },
  unread: {
    fontFamily: fonts.bodyStrong,
    color: colors.tealPressed,
    backgroundColor: colors.mint,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
  },
  customer: { fontFamily: fonts.display, color: colors.ink, fontSize: 18 },
  status: { fontFamily: fonts.bodyStrong, color: colors.teal, fontSize: 13 },
  warning: { color: colors.danger },
  body: { fontFamily: fonts.body, color: colors.text, fontSize: 13, lineHeight: 19 },
  time: { fontFamily: fonts.body, color: colors.muted, fontSize: 12 },
  review: {
    minHeight: 44,
    paddingHorizontal: space.md,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.lineSoft,
  },
  empty: { paddingVertical: 32, alignItems: 'center' },
  emptyTitle: { fontFamily: fonts.display, color: colors.ink, fontSize: 20 },
});
