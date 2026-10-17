import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

type IconProps = { color: string; size?: number };
type AppIconProps = IconProps & { name: ComponentProps<typeof Feather>['name'] };

/** Shared square canvas; labels belong to the containing button, not its decoration. */
export function AppIcon({ name, color, size = 22 }: AppIconProps) {
  return <View aria-hidden={true} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <Feather allowFontScaling={false} name={name} size={size} color={color} style={{ lineHeight: size, includeFontPadding: false, textAlign: 'center' }} />
  </View>;
}

export const HomeIcon = (props: IconProps) => <AppIcon {...props} name="home" />;
export const OrderIcon = (props: IconProps) => <AppIcon {...props} name="plus-square" />;
export const OrdersIcon = (props: IconProps) => <AppIcon {...props} name="clipboard" />;
export const GoalsIcon = (props: IconProps) => <AppIcon {...props} name="bar-chart-2" />;
export const PdvIcon = (props: IconProps) => <AppIcon {...props} name="map-pin" />;
