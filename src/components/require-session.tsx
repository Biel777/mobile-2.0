import type { ComponentType } from 'react';
import { Redirect } from 'expo-router';
import { useAppStore } from '../data/store';

/** Guard screens inside the mounted navigator, so deep links can safely redirect. */
export function withSession<P extends object>(Screen: ComponentType<P>) {
  return function SessionProtectedScreen(props: P) {
    const session = useAppStore(state => state.session);
    const hydrated = useAppStore(state => state.hydrated);
    const online = useAppStore(state => state.online);
    const authRequired = useAppStore(state => state.authRequired);
    if (!hydrated) return null;
    if (!session || (authRequired && online)) return <Redirect href="/" />;
    return <Screen {...props} />;
  };
}
