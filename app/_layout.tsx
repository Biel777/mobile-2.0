import Feather from '@expo/vector-icons/Feather';
import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { useFonts } from 'expo-font';
import NetInfo from '@react-native-community/netinfo';
import { HeaderActions } from '../src/components/menu';
import { useAppStore } from '../src/data/store';
import { colors, fonts } from '../src/theme';

import { IntegrationStatus } from '../src/components/integration-status';

const HUBS = ['/', '/clientes', '/pedidos', '/metas', '/positivacao', '/bandeira'];

export default function Layout() {
  const path = usePathname();
  const hydrated = useAppStore(state => state.hydrated);
  const session = useAppStore(state => state.session);
  const authRequired = useAppStore(state => state.authRequired);
  const online = useAppStore(state => state.online);
  const setOnline = useAppStore((state) => state.setOnline);
  const [ready] = useFonts({
    ...Feather.font,
    Outfit_500Medium: require('../assets/fonts/Outfit-Medium.ttf'),
    Outfit_700Bold: require('../assets/fonts/Outfit-Bold.ttf'),
    Inter_400Regular: require('../assets/fonts/Inter-Regular.ttf'),
    Inter_600SemiBold: require('../assets/fonts/Inter-SemiBold.ttf'),
  });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const sync = () => setOnline(navigator.onLine);
      sync();
      window.addEventListener('online', sync);
      window.addEventListener('offline', sync);
      return () => {
        window.removeEventListener('online', sync);
        window.removeEventListener('offline', sync);
      };
    }
    const sub = NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected)));
    return () => sub();
  }, [setOnline]);

  useEffect(() => {
    if (hydrated && online && session?.token && !authRequired) void useAppStore.getState().flush();
  }, [hydrated, online, session?.token, authRequired]);

  if (!ready || !hydrated) {
    return <View style={{ flex: 1, backgroundColor: colors.page }} />;
  }

  return (
    <View style={{ flex: 1, maxWidth: 430, width: '100%', alignSelf: 'center', backgroundColor: colors.page }}>
      <StatusBar style="dark" />
      <IntegrationStatus />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.pageDefault },
          headerTintColor: colors.ink,
          headerTitleStyle: { fontFamily: fonts.display, fontSize: 18 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.page },
          headerRight: HUBS.includes(path) ? undefined : () => <HeaderActions />,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="clientes" options={{ title: 'Escolher PDV' }} />
        <Stack.Screen name="pedido/[id]" options={{ title: 'Digitação' }} />
        <Stack.Screen name="pedido/[id]/revisao" options={{ title: 'Revisão' }} />
        <Stack.Screen name="pedidos/index" options={{ title: 'Acompanhamento' }} />
        <Stack.Screen name="pedidos/[id]" options={{ title: 'Pedido' }} />
        <Stack.Screen name="nota/[orderId]/[subId]" options={{ title: 'Nota fiscal' }} />
        <Stack.Screen name="visitas" options={{ title: 'Visitas de hoje' }} />
        <Stack.Screen name="visita" options={{ title: 'Resumo do cliente' }} />
        <Stack.Screen name="atualizacoes" options={{ title: 'Atualizações dos pedidos' }} />
        <Stack.Screen name="metas" options={{ title: 'Metas' }} />
        <Stack.Screen name="positivacao" options={{ title: 'Positivação' }} />
        <Stack.Screen name="bandeira" options={{ title: 'Bandeira' }} />
      </Stack>
    </View>
  );
}
