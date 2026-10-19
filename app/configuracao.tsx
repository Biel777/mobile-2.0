import { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Banner, PrimaryButton } from '@components/ui';
import { colors, space } from '../src/theme';
import { buildEndpoint, configuredFields, saveEndpoint, testEndpoint, useConnection } from '@bff/cases/connection';

export default function ConnectionScreen() {
  const [fields, setFields] = useState(configuredFields);
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const busy = useConnection(state => state.busy);
  let preview = '';
  try { preview = buildEndpoint(fields); } catch (error) { preview = (error as Error).message; }
  const save = async (demo = false) => {
    try { await saveEndpoint(fields, demo); router.replace('/'); }
    catch (error) { setMessage((error as Error).message); }
  };
  return <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.md }}>
    <Text>Conexão Tradetools</Text>
    <Text>Ao mudar a conexão, entre novamente. Cada destino mantém seu próprio cache e seus rascunhos.</Text>
    <PrimaryButton title={`Protocolo: ${fields.scheme.toUpperCase()} · tocar para alternar`} disabled={busy || testing}
      onPress={() => setFields({ ...fields, scheme: fields.scheme === 'http' ? 'https' : 'http' })} />
    {(['host', 'industry'] as const).map(field => <View key={field} style={{ gap: 8 }}>
      <Text>{field === 'host' ? 'Host' : 'Código da indústria (vazio no ambiente local)'}</Text>
      <TextInput accessibilityLabel={field === 'host' ? 'Host' : 'Código da indústria'} value={fields[field]} autoCapitalize="none" autoCorrect={false} editable={!busy && !testing}
        onChangeText={value => setFields({ ...fields, [field]: value })}
        style={{ padding: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft }} />
    </View>)}
    <Text selectable accessibilityLabel="URL resultante">{preview}</Text>
    {message ? <Banner text={message} /> : null}
    <PrimaryButton title={testing ? 'Testando…' : 'Testar conexão'} disabled={busy || testing} onPress={() => {
      setTesting(true); setMessage('');
      void testEndpoint(fields).then(setMessage).catch(error => setMessage(error.message)).finally(() => setTesting(false));
    }} />
    <PrimaryButton title={busy ? 'Salvando…' : 'Salvar conexão'} disabled={busy || testing} onPress={() => { void save(); }} />
    <PrimaryButton title="Entrar em demonstração com dados simulados" disabled={busy || testing} onPress={() => { void save(true); }} />
  </ScrollView>;
}
