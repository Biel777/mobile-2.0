import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import { HomeIcon } from './icons';

export function HeaderActions() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Início" style={styles.home} onPress={() => router.replace('/')}>
      <HomeIcon color={colors.onPrimary} size={18} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  home: {
    width: 44,
    minHeight: 44,
    marginRight: 4,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
