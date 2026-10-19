import { resolveOrderTable } from '@bff/cases/sales';
import { reviewOrder } from '@bff/cases/sales';
import { withSession } from '@components/require-session';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ProductFace } from '@components/product-face';
import { Banner, Card, GhostButton, PrimaryButton } from '@components/ui';
import { useAppStore } from '@bff/cases/sales';
import { money } from '@bff/cases/sales';

import { colors, fonts, radius, space } from '../../../src/theme';

function RevisaoScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useAppStore((state) => state.orders.find((item) => item.id === id));
  const online = useAppStore((state) => state.online);
  const enqueue = useAppStore((state) => state.enqueue);
  const updateDraft = useAppStore((state) => state.updateDraft);

  if (!order) {
    return <Banner tone="danger" text="Rascunho não encontrado." />;
  }

  const customer = catalog.customers.find((item) => item.id === order.customerId);
  const table = resolveOrderTable(catalog.tables.find((item) => item.id === order.tableId), order);
  if (!customer || !table) {
    return <Banner tone="danger" text="Cadastro incompleto no cache." />;
  }

  const coupon = catalog.coupons.find((item) => item.code === order.couponCode);
  const { quote, issues, month, minLeft, canSubmit: ok, scheduled } = reviewOrder({ order, table, customer, coupon });
  const ordem = (order.distributorIds ?? [])
    .map((distributorId) => customer.distributors.find((item) => item.id === distributorId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const dates = order.scheduleDates ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {!online ? <Banner text="Sem internet: o pedido entra na fila e será enviado ao reconectar." /> : null}

        <Card>
          <Text style={styles.kicker}>Cliente</Text>
          <Text style={styles.clientName}>{customer.name}</Text>
          <Text style={styles.meta}>CNPJ {customer.cnpj}</Text>
          <Text style={styles.meta}>{customer.city}</Text>
        </Card>

        <View style={{ height: space.sm }} />
        <Card>
          <View style={styles.head}>
            <Text style={styles.section}>Condição</Text>
          </View>
          <Text style={styles.line}>{table.name}</Text>
          <Text style={styles.meta}>
            Mínimo {money(table.minValue)} líquido
            {month > 0 ? ` · ${money(month)} já no mês` : ''}
          </Text>
          {order.couponCode ? <Text style={styles.meta}>Cupom {order.couponCode}</Text> : null}
        </Card>

        <View style={{ height: space.sm }} />
        <Card>
          <View style={styles.head}>
            <Text style={styles.section}>Ordem de envio</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/pedido/${order.id}?step=2`)}>
              <Text style={styles.link}>Alterar</Text>
            </Pressable>
          </View>
          {ordem.length === 0 ? <Text style={styles.meta}>Nenhum distribuidor selecionado.</Text> : null}
          {ordem.map((item, index) => (
            <View key={item.id} style={styles.distRow}>
              <View style={styles.rank}>
                <Text style={styles.rankText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.distName}>{item.name}</Text>
                <Text style={styles.meta}>Prazo {order.prazos?.[item.id] ?? '—'} dias</Text>
              </View>
            </View>
          ))}
        </Card>

        <View style={{ height: space.sm }} />
        <Card>
          <Text style={styles.section}>Quando enviar</Text>
          <View style={styles.row}>
            <Pressable accessibilityRole="button" onPress={() => updateDraft(order.id, { scheduleDates: [] })}>
              <Text style={[styles.chip, dates.length === 0 && styles.chipOn]}>Agora</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => updateDraft(order.id, { scheduleDates: dates.length ? dates : [''] })}
            >
              <Text style={[styles.chip, dates.length > 0 && styles.chipOn]}>Agendar</Text>
            </Pressable>
          </View>
          {dates.length > 0 ? (
            <TextInput
              value={dates[0] ?? ''}
              placeholder="AAAA-MM-DD"
              style={styles.input}
              onChangeText={(value) =>
                updateDraft(order.id, { scheduleDates: dates[1] ? [value, dates[1]] : [value] })
              }
            />
          ) : null}
          {scheduled.map(part => <Text key={part.date} style={styles.meta}>{part.date}: {part.lines.reduce((sum, line) => sum + line.quantity, 0)} unidades (prévia)</Text>)}
          {table.dividePedido && dates.length > 0 ? (
            <TextInput
              value={dates[1] ?? ''}
              placeholder="Segunda data para dividir"
              style={styles.input}
              onChangeText={(value) =>
                updateDraft(order.id, { scheduleDates: value ? [dates[0] ?? '', value] : [dates[0] ?? ''] })
              }
            />
          ) : null}
        </Card>

        <View style={{ height: space.sm }} />
        <Card>
          <View style={styles.head}>
            <Text style={styles.section}>Itens ({quote.lines.length})</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push(`/pedido/${order.id}?step=3`)}>
              <Text style={styles.link}>Editar quantidades</Text>
            </Pressable>
          </View>
          {quote.lines.length === 0 ? <Text style={styles.meta}>Nenhum produto no pedido.</Text> : null}
          {quote.lines.map((line) => {
            const product = table.products.find((item) => item.ean === line.ean);
            return (
              <View key={line.ean} style={styles.item}>
                <ProductFace name={line.name} restricted={product?.photoRestricted} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{line.name}</Text>
                  <Text style={styles.meta}>
                    {line.quantity} un · {money(line.listPrice)} · {line.discountPercent}%
                  </Text>
                  <Text style={styles.itemNet}>{money(line.net)}</Text>
                </View>
              </View>
            );
          })}
        </Card>

        <View style={{ height: space.sm }} />
        <Card>
          <Text style={styles.total}>Líquido {money(quote.net)}</Text>
          <Text style={styles.meta}>
            Bruto {money(quote.gross)} · desconto {money(quote.discountValue)}
          </Text>
          {minLeft > 0 ? (
            <Text style={styles.warn}>Faltam {money(minLeft)} para o mínimo da condição</Text>
          ) : (
            <Text style={styles.good}>Mínimo da condição atingido</Text>
          )}
        </Card>

        {issues.map((issue) => (
          <View key={issue.code + issue.message} style={{ marginTop: space.sm }}>
            <Banner tone={issue.blocking ? 'danger' : 'warn'} text={issue.message} />
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.footerSide}>
          <GhostButton title="Voltar" onPress={() => router.back()} />
        </View>
        <View style={styles.footerMain}>
          <PrimaryButton
            title={online ? 'Enviar pedido' : 'Salvar na fila offline'}
            disabled={!ok}
            onPress={() => {
              enqueue(order.id);
              router.replace('/pedidos');
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, paddingBottom: 24 },
  kicker: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 12, textTransform: 'uppercase' },
  clientName: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.ink, marginTop: 4 },
  section: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  link: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 14 },
  line: { color: colors.ink, fontFamily: fonts.bodyStrong },
  meta: { color: colors.text, fontFamily: fonts.body, marginTop: 4 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.sm },
  rank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: { color: colors.onPrimary, fontFamily: fonts.bodyStrong, fontSize: 13 },
  distName: { fontFamily: fonts.bodyStrong, color: colors.ink, fontSize: 15 },
  item: { flexDirection: 'row', gap: 10, marginTop: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: colors.lineSoft },
  itemName: { fontFamily: fonts.bodyStrong, color: colors.ink },
  itemNet: { marginTop: 2, fontFamily: fonts.displayBold, color: colors.ink },
  total: { fontSize: 22, fontFamily: fonts.displayBold, color: colors.ink },
  warn: { marginTop: 8, color: colors.warn, fontFamily: fonts.bodyStrong },
  good: { marginTop: 8, color: colors.success, fontFamily: fonts.bodyStrong },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    fontFamily: fonts.bodyStrong,
    overflow: 'hidden',
    minHeight: 44,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink, color: colors.onPrimary },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    fontFamily: fonts.body,
    color: colors.ink,
  },
  footer: {
    flexDirection: 'row',
    gap: 8,
    padding: space.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
  },
  footerSide: { flex: 1 },
  footerMain: { flex: 1.4 },
});

export default withSession(RevisaoScreen);
