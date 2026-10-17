import { isPortfolioCustomer } from '../domain/portfolio';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAppStore } from '../data/store';
import { localDateKey } from '../domain/visits';
import { colors, fonts, radius, space } from '../theme';
import { AppIcon } from './icons';

/** Re-evaluate on foreground and across midnight without assuming UTC is the user's day. */
export function useVisitDay() {
  const [day, setDay] = useState(() => localDateKey());
  useEffect(() => {
    const check = () => setDay(localDateKey());
    const interval = setInterval(check, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') check(); });
    return () => { clearInterval(interval); subscription.remove(); };
  }, []);
  return day;
}
export function VisitsSummary() {
  const day = useVisitDay();
  const visits = useAppStore(state => state.visits);
  const customers = useAppStore(state => state.catalog.customers);
  const today = visits.filter(item => item.date === day && !customers.some(customer => customer.id === item.customerId && !isPortfolioCustomer(customer)));
  const completed = today.filter(item => item.completedAt).length;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Visitas de hoje. ${today.length} lojas, ${completed} concluídas. Abrir agenda.`}
    onPress={() => router.push('/visitas')} style={styles.summary}>
    <View style={styles.icon}><AppIcon name="calendar" size={22} color={colors.teal} /></View>
    <View style={{ flex: 1 }}><Text style={styles.title}>Visitas de hoje</Text><Text style={styles.meta}>{today.length ? `${today.length} lojas · ${completed} concluídas` : 'Monte sua lista e prepare cada visita'}</Text></View>
    <AppIcon name="chevron-right" size={20} color={colors.teal} />
  </Pressable>;
}
const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.lineSoft, borderRadius: radius.lg, marginBottom: space.md },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenSoft, borderRadius: radius.md },
  title: { fontFamily: fonts.bodyStrong, color: colors.ink, fontSize: 15 }, meta: { color: colors.muted, fontFamily: fonts.body, fontSize: 12, marginTop: 4 },
});
