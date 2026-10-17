import { withSession } from '../../src/components/require-session';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TabBar } from '../../src/components/tabbar';
import { Banner, Card, GhostButton } from '../../src/components/ui';
import { useAppStore } from '../../src/data/store';
import { money } from '../../src/domain/pricing';
import { statusLabel } from '../../src/domain/status';
import { colors, fonts, radius, space } from '../../src/theme';

function orderNet(items: { unitPrice: number; discountPercent: number; quantNot: number; quantPed: number }[]) {
  return items.reduce((sum, item) => {
    const qty = item.quantNot || item.quantPed;
    return sum + qty * item.unitPrice * (1 - item.discountPercent / 100);
  }, 0);
}

function PedidosScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const orders = useAppStore((state) => state.orders);
  const tracked = useAppStore((state) => state.tracked);
  const online = useAppStore((state) => state.online);
  const flush = useAppStore((state) => state.flush);
  const pullUpdates = useAppStore((state) => state.pullUpdates);

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      {!online ? <Banner text="Offline — a lista local permanece visível." /> : null}
      <Text style={styles.section}>Neste aparelho</Text>
      {orders.length === 0 ? <Text style={styles.empty}>Nenhum rascunho neste aparelho.</Text> : null}
      {orders.map((order) => {
        const customer = catalog.customers.find((item) => item.id === order.customerId);
        const table = catalog.tables.find((item) => item.id === order.tableId);
        const ordem = order.distributorIds?.length ?? 0;
        return (
          <Pressable key={order.id} onPress={() => router.push(`/pedido/${order.id}`)}>
            <View style={{ marginBottom: space.sm }}>
              <Card>
                <Text style={styles.pill}>{order.queueStatus === 'sending' ? 'Enviando…' : order.queueStatus === 'pending' ? 'Na fila' : order.queueStatus === 'failed' ? 'Falha no envio' : order.queueStatus === 'sent' ? 'Enviado' : statusLabel(order.localStatus)}</Text>
                <Text style={styles.name}>{customer?.name}</Text>
                <Text style={styles.meta}>
                  {table?.name ?? 'Sem condição'} · {ordem} distribuidor(es)
                </Text>
                {order.lastError ? <Banner tone="danger" text={order.lastError} /> : null}
              </Card>
            </View>
          </Pressable>
        );
      })}

      <Text style={[styles.section, { marginTop: space.lg }]}>Enviados</Text>
      <GhostButton
        title="Atualizar status"
        onPress={() => {
          void pullUpdates();
        }}
      />
      <View style={{ height: space.sm }} />
      {tracked.map((order) => {
        const subs = order.subOrders ?? [];
        const net = subs.reduce((sum, sub) => sum + orderNet(sub.items), 0);
        const invoiced = subs.filter((sub) => sub.invoice).length;
        return (
          <Pressable key={order.id} onPress={() => router.push(`/pedidos/${order.id}`)}>
            <View style={{ marginBottom: space.sm }}>
              <Card>
                <View style={styles.row}>
                  <Text style={styles.pill}>{statusLabel(order.status)}</Text>
                  <Text style={styles.value}>{money(net)}</Text>
                </View>
                <Text style={styles.name}>{order.customerName}</Text>
                <Text style={styles.meta}>
                  Pedido {order.id} · {invoiced} de {subs.length} com nota
                </Text>
              </Card>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
    <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, paddingBottom: 24 },
  section: { fontFamily: fonts.display, fontSize: 18, color: colors.ink, marginBottom: 8 },
  empty: { color: colors.text, fontFamily: fonts.body, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.yellow,
    color: colors.ink,
    fontFamily: fonts.bodyStrong,
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  value: { fontFamily: fonts.displayBold, fontSize: 16, color: colors.ink },
  name: { fontFamily: fonts.display, color: colors.ink, fontSize: 16, marginTop: 8 },
  meta: { color: colors.text, fontFamily: fonts.body, marginTop: 4 },
});

export default withSession(PedidosScreen);
