import { AppIcon } from '../../../src/components/icons';
import { withSession } from '../../../src/components/require-session';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProductFace } from '../../../src/components/product-face';
import { Banner, Card } from '../../../src/components/ui';
import { useAppStore } from '../../../src/data/store';
import { money } from '../../../src/domain/pricing';
import { colors, fonts, radius, space } from '../../../src/theme';

function invoiceDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T| )/.exec(value);
  if (!match) return 'Data não informada';
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return 'Data não informada';
  return `${day}/${month}/${year}`;
}

function NotaScreen() {
  const { orderId, subId } = useLocalSearchParams<{ orderId: string; subId: string }>();
  const order = useAppStore((state) => state.tracked.find((item) => String(item.id) === String(orderId)));
  const catalog = useAppStore(state => state.catalog);
  const sub = order?.subOrders.find((item) => String(item.id) === String(subId));

  if (!order || !sub?.invoice) {
    return <Banner text="A nota fiscal ainda não está disponível para este pedido." />;
  }

  const invoice = sub.invoice;
  const items = sub.items.filter(item => item.quantNot > 0);
  const units = items.reduce((sum, item) => sum + item.quantNot, 0);
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heading}>
        <Text style={styles.kicker}>Nota fiscal</Text>
        <Text style={styles.title}>{invoice.number}</Text>
        <Text style={styles.subtitle}>{sub.distributorName}</Text>
      </View>

      <Card>
        <Text style={styles.label}>Valor da nota</Text>
        <Text style={styles.total}>{money(invoice.value)}</Text>
        <View style={styles.summaryDivider} />
        <Text style={styles.client}>{order.customerName}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Data de saída</Text>
          <Text style={styles.metaValue}>{invoiceDate(invoice.issuedAt)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Ver pedido ${order.id}`} style={styles.orderLink}
          onPress={() => router.push(`/pedidos/${order.id}`)}>
          <Text style={styles.linkText}>Ver pedido {order.id}</Text>
          <AppIcon name="arrow-right" size={18} color={colors.teal} />
        </Pressable>
      </Card>

      <View style={styles.sectionHead}>
        <Text style={styles.section}>Itens faturados</Text>
        <Text style={styles.itemCount}>{items.length} {items.length === 1 ? 'produto' : 'produtos'} · {units} un</Text>
      </View>
      {!items.length ? <Banner text="Os itens faturados desta nota ainda não foram informados." /> : null}
      {items.map(item => {
        const lineTotal = item.quantNot * item.unitPrice * (1 - item.discountPercent / 100);
        const restricted = catalog.tables.some(table => table.products.some(product => product.ean === item.ean && product.photoRestricted));
        return <View key={item.ean} style={styles.itemCard}>
          <Card>
            <View style={styles.productHead}>
              <ProductFace name={item.name} size={48} restricted={restricted} />
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productCode}>EAN {item.ean}</Text>
              </View>
            </View>
            <View style={styles.productDetails}>
              <View style={styles.quantityBadge}><Text style={styles.quantity}>{item.quantNot} un faturadas</Text></View>
              <Text style={styles.priceInfo}>{money(item.unitPrice)} / un · {item.discountPercent}% desconto</Text>
            </View>
            <View style={styles.itemTotalRow}>
              <Text style={styles.meta}>Líquido do item</Text>
              <Text style={styles.itemTotal}>{money(lineTotal)}</Text>
            </View>
          </Card>
        </View>;
      })}
      <Text style={styles.reference}>Pedido {order.id} · subpedido {sub.id}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: 40 },
  heading: { marginBottom: space.md },
  kicker: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 13 },
  title: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.ink, marginTop: 2 },
  subtitle: { color: colors.text, fontFamily: fonts.body, marginTop: 4, fontSize: 14 },
  label: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 12 },
  total: { fontSize: 32, fontFamily: fonts.displayBold, color: colors.ink, marginTop: 4 },
  summaryDivider: { height: 1, backgroundColor: colors.lineSoft, marginVertical: space.md },
  client: { color: colors.ink, fontFamily: fonts.bodyStrong, fontSize: 14, marginBottom: space.sm },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: space.xs },
  meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 12 },
  metaValue: { color: colors.text, fontFamily: fonts.bodyStrong, fontSize: 12 },
  orderLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  linkText: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 13 },
  sectionHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs, marginTop: space.lg, marginBottom: space.sm },
  section: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  itemCount: { fontFamily: fonts.body, fontSize: 12, color: colors.muted },
  itemCard: { marginBottom: space.sm },
  productHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  productInfo: { flex: 1, minWidth: 0 },
  productName: { color: colors.ink, fontFamily: fonts.bodyStrong, fontSize: 14, lineHeight: 20 },
  productCode: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, marginTop: 3 },
  productDetails: { marginTop: space.sm, gap: space.sm },
  quantityBadge: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 4, backgroundColor: colors.mint, borderRadius: radius.full },
  quantity: { fontFamily: fonts.bodyStrong, color: colors.tealPressed, fontSize: 12 },
  priceInfo: { color: colors.text, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
  itemTotalRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.sm, borderTopWidth: 1, borderTopColor: colors.lineSoft, marginTop: space.sm, paddingTop: space.sm },
  itemTotal: { color: colors.ink, fontFamily: fonts.displayBold, fontSize: 18 },
  reference: { color: colors.muted, fontFamily: fonts.body, fontSize: 11, marginTop: space.sm },
});

export default withSession(NotaScreen);
