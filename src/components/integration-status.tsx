import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useConnection } from '@bff/cases/connection';
import { useAppStore } from '@bff/cases/sales';
import { colors, fonts, space } from '../theme';

export function IntegrationStatus() {
  const apiConfig = useConnection(state => state.config);
  const connectionError = useConnection(state => state.error);
  const [showWarnings, setShowWarnings] = useState(false);
  const warnings = useAppStore(state => state.catalog.integrationWarnings);
  const session = useAppStore(state => state.session);
  const syncing = useAppStore(state => state.syncing);
  const syncError = useAppStore(state => state.syncError);
  const online = useAppStore(state => state.online);
  const authRequired = useAppStore(state => state.authRequired);
  const pullUpdates = useAppStore(state => state.pullUpdates);
  const logout = useAppStore(state => state.logout);
  return <View style={styles.box}>
    <Text style={styles.label}>{apiConfig.mode === 'http' ? `API HTTP · ${apiConfig.protocol === 'legacy' ? 'Legacy' : 'contrato mobile v1'}` : 'Demonstração local · dados simulados'}</Text>
    {apiConfig.mode === 'http' ? <Text style={styles.address}>{apiConfig.baseUrl}</Text> : null}
    <Pressable accessibilityRole="button" onPress={() => router.push('/configuracao')} style={styles.button}><Text style={styles.link}>Configurar conexão</Text></Pressable>
    {connectionError ? <Text style={styles.error}>{connectionError}</Text> : null}
    <View style={styles.actions}>
      <Text style={styles.label}>{!online ? 'Offline · usando cache' : syncing ? 'Sincronizando…' : 'Online'}</Text>
      {session && !authRequired ? <Pressable accessibilityRole="button" disabled={syncing || !online}
        onPress={() => { void pullUpdates(); }} style={styles.button}><Text style={styles.link}>Sincronizar</Text></Pressable> : null}
      {session ? <Pressable accessibilityRole="button" onPress={logout} style={styles.button}><Text style={styles.link}>Sair</Text></Pressable> : null}
    </View>
    {authRequired ? <Text style={styles.error}>Entre novamente para sincronizar. Seus rascunhos continuam salvos.</Text> : null}
    {warnings?.length ? <Pressable accessibilityRole="button" accessibilityState={{ expanded: showWarnings }}
      onPress={() => setShowWarnings(!showWarnings)} style={styles.button}><Text style={styles.link}>Integração em validação · {showWarnings ? 'ocultar limites' : 'ver limites'}</Text></Pressable> : null}
    {showWarnings && warnings?.map(warning => <Text key={warning} style={styles.address}>{warning}</Text>)}
    {syncError ? <Text accessibilityRole="alert" style={styles.error}>{syncError}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  box: { paddingHorizontal: space.md, paddingVertical: 8, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  label: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 12 },
  address: { color: colors.muted, fontFamily: fonts.body, fontSize: 11 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  link: { color: colors.teal, fontFamily: fonts.bodyStrong, fontSize: 13 },
  error: { color: colors.danger, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
});
