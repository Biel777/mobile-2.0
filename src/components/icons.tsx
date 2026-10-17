import { StyleSheet, View } from 'react-native';

type IconProps = { color: string; size?: number };

export function HomeIcon({ color, size = 22 }: IconProps) {
  const roof = size * 0.42;
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: roof,
          borderRightWidth: roof,
          borderBottomWidth: roof * 0.8,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderBottomColor: color,
        }}
      />
      <View
        style={{
          width: size * 0.62,
          height: size * 0.42,
          borderWidth: 2,
          borderTopWidth: 0,
          borderColor: color,
          marginTop: -1,
        }}
      />
    </View>
  );
}

export function OrderIcon({ color, size = 22 }: IconProps) {
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View style={[styles.barH, { backgroundColor: color, width: size * 0.72 }]} />
      <View style={[styles.barV, { backgroundColor: color, height: size * 0.72 }]} />
    </View>
  );
}

export function OrdersIcon({ color, size = 22 }: IconProps) {
  return (
    <View style={[styles.center, { width: size, height: size, gap: 3 }]}>
      {[0.9, 0.7, 0.5].map((width) => (
        <View
          key={width}
          style={{ width: size * width, height: 2, borderRadius: 1, backgroundColor: color, alignSelf: 'flex-start' }}
        />
      ))}
    </View>
  );
}

export function GoalsIcon({ color, size = 22 }: IconProps) {
  const bars = [0.4, 0.7, 1];
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
      {bars.map((height) => (
        <View key={height} style={{ width: 4, height: size * 0.75 * height, borderRadius: 1, backgroundColor: color }} />
      ))}
    </View>
  );
}

export function PdvIcon({ color, size = 22 }: IconProps) {
  return (
    <View style={[styles.center, { width: size, height: size }]}>
      <View style={{ width: size * 0.78, height: 4, borderRadius: 2, backgroundColor: color }} />
      <View
        style={{
          width: size * 0.62,
          height: size * 0.48,
          borderWidth: 2,
          borderTopWidth: 0,
          borderColor: color,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  barH: { position: 'absolute', height: 2, borderRadius: 1 },
  barV: { position: 'absolute', width: 2, borderRadius: 1 },
});
