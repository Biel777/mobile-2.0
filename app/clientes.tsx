import { withSession } from '../src/components/require-session';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, TextInput, View } from 'react-native';
import { TabBar } from '../src/components/tabbar';
import { Banner, Card, PrimaryButton } from '../src/components/ui';
import { useAppStore } from '../src/data/store';
import { startOrderForPdv } from '../src/data/order-entry';
import { isPortfolioCustomer } from '../src/domain/portfolio';
import { colors, fonts, space } from '../src/theme';

function ClientesScreen() {
  const catalog = useAppStore(state => state.catalog);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('pt-BR');
    const digits = q.replace(/\D/g, '');
    return catalog.customers.filter(item => isPortfolioCustomer(item) && (!q || item.name.toLocaleLowerCase('pt-BR').includes(q) || !!digits && item.cnpj.replace(/\D/g, '').includes(digits)));
  }, [query, catalog.customers]);
  return <View style={styles.screen}>
    <View style={styles.header}><Text style={styles.help}>Escolha a loja para iniciar um pedido.</Text>
      <TextInput accessibilityLabel="Buscar loja por nome ou CNPJ" value={query} onChangeText={setQuery} placeholder="Buscar por nome ou CNPJ" style={styles.input} />
      {error ? <Banner tone="danger" text={error} /> : null}
    </View>
    <FlatList data={list} keyExtractor={item => String(item.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}
      ListEmptyComponent={<Text style={styles.help}>{query ? 'Nenhuma loja encontrada para esta busca.' : 'Nenhuma loja disponível na carteira. Sincronize para atualizar.'}</Text>}
      renderItem={({ item }) => <Card><Text style={styles.name}>{item.name}</Text><Text style={styles.meta}>{item.cnpj}</Text><Text style={styles.city}>{item.city}</Text>
        <View style={{ marginTop: 12 }}><PrimaryButton title="Digitar pedido" onPress={() => { try { setError(''); startOrderForPdv(item); } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível iniciar o pedido.'); } }} /></View>
      </Card>} />
    <TabBar />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page }, header: { padding: space.md, paddingBottom: 0 },
  content: { padding: space.md, paddingTop: 8, paddingBottom: 24, gap: 8 },
  input: { minHeight: 48, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, marginBottom: 8, fontFamily: fonts.body, color: colors.ink },
  help: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.muted, marginBottom: 12 },
  name: { fontFamily: fonts.display, fontSize: 18, color: colors.ink }, meta: { color: colors.text, fontFamily: fonts.body, fontSize: 13, marginTop: 5 }, city: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
});
export default withSession(ClientesScreen);
