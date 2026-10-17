import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius } from '../theme';

const sunPack = require('../../assets/products/pack-sun.jpg');
const tealPack = require('../../assets/products/pack-teal.jpg');

export function ProductFace({
  name,
  restricted,
  size = 72,
}: {
  name: string;
  restricted?: boolean;
  size?: number;
}) {
  if (restricted) {
    return (
      <View
        accessibilityLabel="Caixa padrão. Foto do medicamento não exibida."
        style={[styles.box, styles.restricted, { width: size, height: size }]}
      >
        <View style={styles.cross}>
          <View style={styles.crossV} />
          <View style={styles.crossH} />
        </View>
        <Text style={styles.restrictedText}>Sem foto</Text>
      </View>
    );
  }

  const sun = name.toLowerCase().includes('vita') || name.toLowerCase().includes('kit');
  return (
    <Image
      accessibilityLabel={`Imagem de ${name}`}
      source={sun ? sunPack : tealPack}
      style={[styles.box, { width: size, height: size }]}
    />
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  restricted: {
    backgroundColor: colors.page,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cross: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  crossV: { position: 'absolute', width: 3, height: 16, borderRadius: 1, backgroundColor: colors.muted },
  crossH: { position: 'absolute', width: 16, height: 3, borderRadius: 1, backgroundColor: colors.muted },
  restrictedText: {
    marginTop: 6,
    color: colors.muted,
    fontFamily: fonts.bodyStrong,
    fontSize: 9,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
