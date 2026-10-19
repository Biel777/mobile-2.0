import { AppIcon } from '../icons';

import { Pressable, Text, View } from 'react-native';

import { money } from '@bff/cases/sales';

import { colors } from '../../theme';

import type { LocalOrder, CommercialTable } from '@bff/contract';
import { orderStyles as styles } from './styles';
const displayDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;
export function ConditionStep({
  order,
  tables,
  table,
  updateDraft,
}: {
  order: LocalOrder;
  tables: CommercialTable[];
  table: CommercialTable | undefined;
  updateDraft: (id: string, patch: Partial<LocalOrder>) => void;
}) {
  return (
    <>
      <Text style={styles.title}>Condição comercial</Text>
      <Text style={styles.help}>
        Escolha a condição para este pedido. Os prazos serão definidos com os distribuidores.
      </Text>
      {tables.map((item) => {
        const on = item.id === table?.id;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${item.name}. Mínimo ${money(item.minValue)} ${item.minValueBasis === 'GROSS' ? 'bruto' : 'líquido'}. Validade ${displayDate(item.expiresAt)}.`}
            onPress={() => {
              if (item.id !== order.tableId) updateDraft(order.id, { tableId: item.id, lines: [] });
            }}
            style={[styles.option, on && styles.optionOn]}
          >
            <View style={styles.optionHeading}>
              <Text style={[styles.name, { flex: 1 }]}>{item.name}</Text>
              <View style={[styles.radio, on && styles.radioOn]}>
                {on ? <View style={styles.radioDot} /> : null}
              </View>
            </View>
            <View style={styles.conditionFacts}>
              <View style={styles.fact}>
                <Text style={styles.factLabel}>
                  Mínimo {item.minValueBasis === 'GROSS' ? 'bruto' : 'líquido'}
                </Text>
                <Text style={styles.factValue}>{money(item.minValue)}</Text>
              </View>
              {item.monthBilledNet != null && item.monthBilledNet > 0 ? (
                <View style={styles.fact}>
                  <Text style={styles.factLabel}>Faturado no mês</Text>
                  <Text style={styles.factValue}>{money(item.monthBilledNet)}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.validity}>
              <AppIcon name="calendar" size={14} color={colors.muted} />
              <Text style={styles.factLabel}>Válida até {displayDate(item.expiresAt)}</Text>
            </View>
          </Pressable>
        );
      })}
    </>
  );
}
