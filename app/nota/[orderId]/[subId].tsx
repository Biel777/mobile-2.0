import { withSession } from '../../../src/components/require-session';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Banner, Card } from '../../../src/components/ui';
import { useAppStore } from '../../../src/data/store';
import { money } from '../../../src/domain/pricing';
import { colors, fonts, space } from '../../../src/theme';

function NotaScreen() {
  const { orderId, subId } = useLocalSearchParams<{ orderId: string; subId: string }>();
  const order = useAppStore((state) => state.tracked.find((item) => String(item.id) === String(orderId)));
  const sub = order?.subOrders.find((item) => String(item.id) === String(subId));

  if (!order || !sub?.invoice) {
    return <Banner tone="danger" text="Nota ainda não disponível." />;
  }

  const invoice = sub.invoice;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Nota fiscal</Text>
      <Text style={styles.title}>{invoice.number}</Text>
      <Card>
        <Text style={styles.line}>{sub.distributorName}</Text>
        <Text style={styles.meta}>Cliente {order.customerName}</Text>
        <Text style={styles.meta}>Saída {invoice.issuedAt}</Text>
        <Text style={styles.meta}>Pedido {order.id} · subpedido {sub.id}</Text>
      </Card>
      <Text style={styles.section}>Itens faturados</Text>
      {sub.items.map((item) => (
        <Text key={item.ean} style={styles.line}>
          {item.quantNot || item.quantPed}× {item.name} · {money(item.unitPrice)} − {item.discountPercent}%
        </Text>
      ))}
      <View style={{ height: space.md }} />
      <Card>
        <Text style={styles.total}>{money(invoice.value)}</Text>
        <Text style={styles.meta}>Valor da nota</Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.md, paddingBottom: 40 },
  kicker: { color: colors.teal, fontFamily: fonts.bodyStrong },
  title: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.ink, marginBottom: space.sm },
  section: { fontFamily: fonts.display, color: colors.ink, marginTop: space.md, marginBottom: space.sm },
  line: { color: colors.ink, fontFamily: fonts.bodyStrong, marginTop: 4 },
  meta: { color: colors.text, fontFamily: fonts.body, marginTop: 4 },
  total: { fontSize: 28, fontFamily: fonts.displayBold, color: colors.ink },
});

export default withSession(NotaScreen);
