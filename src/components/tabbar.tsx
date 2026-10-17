import { router, usePathname } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { GoalsIcon, HomeIcon, OrderIcon, OrdersIcon, PdvIcon } from './icons';

const TABS = [
  { label: 'Início', href: '/', icon: HomeIcon },
  { label: 'Pedido', href: '/clientes', icon: OrderIcon },
  { label: 'Pedidos', href: '/pedidos', icon: OrdersIcon },
  { label: 'Metas', href: '/metas', icon: GoalsIcon },
  { label: 'PDVs', href: '/positivacao', icon: PdvIcon },
] as const;

export function TabBar() {
  const path = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((tab) => {
        const on = tab.href === '/' ? path === '/' : path === tab.href;
        const Icon = tab.icon;
        const color = on ? colors.ink : colors.muted;
        return (
          <Pressable
            key={tab.href}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on }}
            style={styles.tab}
            onPress={() => router.replace(tab.href)}
          >
            <Icon color={color} />
            <View style={[styles.mark, on && styles.markOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 6,
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  mark: { width: 16, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  markOn: { backgroundColor: colors.yellow },
});
