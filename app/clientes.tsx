import { withSession } from '../src/components/require-session';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TabBar } from '../src/components/tabbar';
import { Banner, Card } from '../src/components/ui';
import { useAppStore } from '../src/data/store';
import { colors, fonts, space } from '../src/theme';

function ClientesScreen() {
  const catalog = useAppStore((state) => state.catalog);
  const [query, setQuery] = useState('');
  const createDraft = useAppStore((state) => state.createDraft);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.customers.filter(
      (item) => !q || item.name.toLowerCase().includes(q) || item.cnpj.includes(q),
    );
  }, [query, catalog.customers]);

  return (
    <View style={styles.screen}>
    <ScrollView contentContainerStyle={styles.content}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por nome ou CNPJ"
        style={styles.input}
      />
      {list.map((customer) => (
        <Pressable
          key={customer.id}
          onPress={() => {
            if (!customer.hasSalesArea || customer.tableIds.length === 0) {
              return;
            }
            const id = createDraft(customer.id, customer.tableIds[0]);
            router.push(`/pedido/${id}`);
          }}
        >
          <View style={{ marginBottom: space.sm }}>
            <Card>
              <Text style={styles.name}>{customer.name}</Text>
              <Text style={styles.meta}>
                {customer.cnpj} · {customer.city}
              </Text>
              {!customer.hasSalesArea ? (
                <View style={{ marginTop: 8 }}>
                  <Banner tone="danger" text="PDV sem área Legacy — não é possível abrir pedido." />
                </View>
              ) : (
                <View style={styles.cta}>
                  <Text style={styles.ctaText}>Continuar</Text>
                </View>
              )}
            </Card>
          </View>
        </Pressable>
      ))}
    </ScrollView>
    <TabBar />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.md, paddingBottom: 24 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    padding: 12,
    marginBottom: space.md,
    fontFamily: fonts.body,
    color: colors.ink,
  },
  name: { fontFamily: fonts.display, fontSize: 16, color: colors.ink },
  meta: { color: colors.text, fontFamily: fonts.body, marginTop: 4 },
  cta: {
    marginTop: 12,
    backgroundColor: colors.mint,
    borderRadius: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: { color: colors.teal, fontFamily: fonts.bodyStrong },
});

export default withSession(ClientesScreen);
