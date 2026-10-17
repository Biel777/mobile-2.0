import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, space } from '../theme';

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function BigNumber({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <View style={styles.big}>
      <Text style={styles.bigLabel}>{label}</Text>
      <Text style={styles.bigValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.primary, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={[styles.primaryText, disabled && styles.disabledText]}>{title}</Text>
    </Pressable>
  );
}

export function GhostButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.ghost}>
      <Text style={styles.ghostText}>{title}</Text>
    </Pressable>
  );
}

export function Banner({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'danger' | 'good' }) {
  const map = {
    warn: { bg: colors.warnBg, fg: colors.warn },
    danger: { bg: colors.dangerBg, fg: colors.danger },
    good: { bg: colors.successBg, fg: colors.success },
  }[tone];
  return (
    <View style={[styles.banner, { backgroundColor: map.bg }]}>
      <Text style={[styles.bannerText, { color: map.fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
  },
  big: { flex: 1, minWidth: 0 },
  bigLabel: {
    color: colors.teal,
    fontFamily: fonts.bodyStrong,
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  bigValue: {
    color: colors.ink,
    fontFamily: fonts.displayBold,
    fontSize: 22,
    marginTop: 4,
  },
  hint: { color: colors.text, fontFamily: fonts.body, marginTop: 4, fontSize: 12 },
  primary: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.brandHover },
  primaryText: { color: colors.onPrimary, fontFamily: fonts.bodyStrong, fontSize: 16 },
  disabled: { backgroundColor: colors.disabled },
  disabledText: { color: colors.muted },
  ghost: {
    borderRadius: radius.md,
    minHeight: 48,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  ghostText: { color: colors.text, fontFamily: fonts.bodyStrong, fontSize: 16 },
  banner: { borderRadius: radius.md, padding: space.sm, marginBottom: space.sm },
  bannerText: { fontFamily: fonts.bodyStrong, fontSize: 13 },
});
