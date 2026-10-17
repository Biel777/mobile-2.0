import { withSession } from '../../src/components/require-session';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProductFace } from '../../src/components/product-face';
import { Banner, Card, PrimaryButton } from '../../src/components/ui';
import { useAppStore } from '../../src/data/store';
import { money } from '../../src/domain/pricing';
import { statusLabel } from '../../src/domain/status';
import type { TrackedItem } from '../../src/domain/types';
import { colors, fonts, radius, space } from '../../src/theme';

function lineNet(item: TrackedItem, qty: number) {
  return qty * item.unitPrice * (1 - item.discountPercent / 100);
}

function PedidoDetalheScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const { id } = useLocalSearchParams<{ id: string }>();
  const tracked = useAppStore((state) => state.tracked);
  const refreshTracked = useAppStore((state) => state.refreshTracked);
  const order = tracked.find((item) => String(item.id) === String(id));

  if (!order) {
    return <Banner tone="danger" text="Pedido não encontrado." />;
  }

  const subs = order.subOrders ?? [];
  const waiting = subs.some((sub) => !sub.invoice);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>{statusLabel(order.status)}</Text>
      </View>
      <Text style={styles.kicker}>Pedido {order.id}</Text>
      <Text style={styles.title}>{order.customerName}</Text>
      <Text style={styles.meta}>{order.tableName}</Text>
      {order.status === 14 ? (
        <Pressable onPress={() => router.push('/bandeira')}>
          <Banner text="Aguardando o mínimo da bandeira. Toque para ver a cesta do grupo." />
        </Pressable>
      ) : null}
      {order.status === 3 && order.dataEnvio ? <Banner text={`Envio agendado para ${order.dataEnvio}.`} /> : null}

      <Text style={styles.section}>Subpedidos</Text>
      {subs.map((sub) => {
        const net = sub.items.reduce((sum, item) => sum + lineNet(item, item.quantNot || item.quantPed), 0);
        return (
          <View key={sub.id} style={{ marginBottom: space.sm }}>
            <Card>
              <View style={styles.row}>
                <Text style={styles.name}>{sub.distributorName}</Text>
                <Text style={styles.status}>{statusLabel(sub.status)}</Text>
              </View>
              <Text style={styles.meta}>Subpedido {sub.id} · prazo {sub.prazo} dias</Text>
              {sub.items.map((item) => (
                <View key={item.ean} style={styles.item}>
                  <View style={styles.itemHead}>
                    <ProductFace
                      name={item.name}
                      size={48}
                      restricted={catalog.tables.some((table) =>
                        table.products.some((product) => product.ean === item.ean && product.photoRestricted),
                      )}
                    />
                    <Text style={[styles.itemName, { flex: 1 }]}>{item.name}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {money(item.unitPrice)} · {item.discountPercent}% off
                  </Text>
                  <Text style={styles.meta}>
                    Pedido {item.quantPed} · Atendido {item.quantEsp} · Faturado {item.quantNot}
                  </Text>
                  <Text style={styles.price}>Líquido {money(lineNet(item, item.quantNot || item.quantPed))}</Text>
                  {item.reason ? <Banner text={item.reason} /> : null}
                </View>
              ))}
              <Text style={styles.total}>Subtotal {money(net)}</Text>
              {sub.invoice ? (
                <Pressable
                  style={styles.noteBtn}
                  onPress={() => router.push(`/nota/${order.id}/${sub.id}`)}
                >
                  <Text style={styles.noteBtnText}>
                    Ver nota {sub.invoice.number} · {money(sub.invoice.value)}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.meta}>Aguardando nota fiscal</Text>
              )}
            </Card>
          </View>
        );
      })}

      {waiting ? (
        <PrimaryButton
          title="Consultar retorno e nota"
          onPress={() => {
            void refreshTracked();
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: 40 },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.mint,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  pillText: { color: colors.tealPressed, fontFamily: fonts.bodyStrong, fontSize: 12 },
  kicker: { color: colors.teal, fontFamily: fonts.bodyStrong },
  title: { fontSize: 24, fontFamily: fonts.displayBold, color: colors.ink },
  section: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: space.md, marginBottom: space.sm },
  meta: { color: colors.text, fontFamily: fonts.body, marginTop: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { fontFamily: fonts.display, color: colors.ink, fontSize: 16, flex: 1 },
  status: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 12 },
  item: { marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { fontFamily: fonts.bodyStrong, color: colors.ink },
  price: { marginTop: 4, color: colors.ink, fontFamily: fonts.bodyStrong },
  total: { marginTop: space.sm, fontFamily: fonts.displayBold, color: colors.ink, fontSize: 16 },
  noteBtn: {
    marginTop: space.sm,
    backgroundColor: colors.mint,
    borderRadius: radius.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteBtnText: { color: colors.teal, fontFamily: fonts.bodyStrong },
});

export default withSession(PedidoDetalheScreen);
