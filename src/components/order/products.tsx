import { AppIcon } from '../icons';






import { Pressable, Text, TextInput, View } from 'react-native';
import { ProductFace } from '../product-face';
import { Card } from '../ui';

import { productPresentation } from '@bff/cases/sales';
import { money } from '@bff/cases/sales';


import { colors, space } from '../../theme';


import type { BootstrapData, LocalOrder, CommercialTable, Coupon, OrderQuote } from '@bff/contract';
import { orderStyles as styles } from './styles';
export function ProductsStep({ catalog, order, table, coupon, quote, updateDraft }: { catalog: BootstrapData; order: LocalOrder; table: CommercialTable; coupon: Coupon | undefined; quote: OrderQuote | undefined; updateDraft: (id: string, patch: Partial<LocalOrder>) => void }) { return (
          <>
            <Text style={styles.title}>Produtos e descontos</Text>
            <Text style={styles.help}>{table.name}. O líquido recalcula a cada quantidade.</Text>
            <Card>
              <Text style={styles.name}>Condição</Text>
              <Text style={styles.meta}>
                Mínimo {money(table.minValue)} líquido
                {table.monthBilledNet ? ` · ${money(table.monthBilledNet)} já no mês` : ''}
              </Text>
              {table.comboParticipation ? (
                <Text style={styles.meta}>Combo: o mix obrigatório precisa de {table.comboParticipation}% do líquido</Text>
              ) : null}
              {table.dividePedido ? <Text style={styles.meta}>Pode dividir o envio em duas datas.</Text> : null}
              <Text style={styles.meta}>{catalog.unsupportedFeatures?.includes('coupons') ? 'Cupom indisponível nesta integração' : <>Cupom {coupon ? `${coupon.code} +${coupon.percent}%` : 'nenhum'} · confirmado no envio</>}</Text>
              <TextInput
                value={order.couponCode ?? ''}
                autoCapitalize="characters"
                placeholder="Código do cupom"
                editable={!catalog.unsupportedFeatures?.includes('coupons')}
                style={styles.coupon}
                onChangeText={(value) => updateDraft(order.id, { couponCode: value.trim().toUpperCase() || undefined })}
              />
            </Card>
            <View style={{ height: space.sm }} />
            {table.products.map((product) => {
              const presentation = productPresentation(table, product, order.lines);
              const qty = order.lines.find((line) => line.ean === product.ean)?.quantity ?? 0;
              const line = quote?.lines.find((item) => item.ean === product.ean);
              const setQty = (quantity: number) => {
                const lines = order.lines.filter((entry) => entry.ean !== product.ean);
                if (quantity > 0) lines.push({ ean: product.ean, quantity });
                updateDraft(order.id, { lines });
              };
              return (
                <View key={product.ean} style={styles.product}>
                  <Card>
                    <View style={styles.productHead}>
                      <ProductFace name={product.name} restricted={product.photoRestricted} />
                      <View style={styles.productInfo}>
                        <Text style={styles.name}>{product.name}</Text>
                        <Text style={styles.price}>{money(product.listPrice)}</Text>
                        <Text style={styles.meta}>Base {product.baseDiscount}%</Text>
                      </View>
                    </View>
                    <View style={styles.mechanics}>
                      <Text style={styles.nextTier}>{presentation.tierMessage}</Text>
                      <View style={styles.ladder}>{presentation.tiers.map(tier => <View key={tier.quantMin} style={[styles.tierChip, tier.focus && styles.tierNext, tier.reached && styles.tierDone]}>
                        <Text style={styles.tierUnits}>{tier.quantMin}</Text><Text style={styles.tierPct}>+{tier.percent}%</Text>
                      </View>)}</View>
                      {presentation.mechanics.map((text, index) => <Text key={index} style={styles.mechLine}>{text}</Text>)}
                    </View>
                    <View style={styles.qtyRow}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Diminuir ${product.name}`}
                        style={styles.stepBtn}
                        onPress={() => setQty(Math.max(0, qty - product.packSize))}
                      >
                        <AppIcon name="minus" color={colors.teal} size={20} />
                      </Pressable>
                      <TextInput
                        accessibilityLabel={`Quantidade ${product.name}`}
                        value={qty ? String(qty) : ''}
                        keyboardType="number-pad"
                        placeholder="0"
                        style={styles.qty}
                        onChangeText={(value) => setQty(Number(value.replace(/\D/g, '')) || 0)}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Aumentar ${product.name}`}
                        style={styles.stepBtn}
                        onPress={() => setQty(qty + product.packSize)}
                      >
                        <AppIcon name="plus" color={colors.teal} size={20} />
                      </Pressable>
                    </View>
                    {line ? (
                      <Text style={styles.line}>
                        {line.badges.length ? line.badges.join(' · ') : 'desconto base'} · {line.discountPercent}% · {money(line.net)}
                      </Text>
                    ) : null}
                  </Card>
                </View>
              );
            })}
          </>
        ); }
