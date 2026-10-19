import { AppIcon } from '../icons';






import { Pressable, Text, View } from 'react-native';





import { MAX_DISTRIBUTORS } from '@bff/contract';
import { colors } from '../../theme';


import type { LocalOrder, Distributor } from '@bff/contract';
import { orderStyles as styles } from './styles';
export function DistributorsStep({ order, selected, prazos, released, openDeadline, setOpenDeadline, updateDraft, move }: { order: LocalOrder; selected: number[]; prazos: Record<number, number>; released: Distributor[]; openDeadline: number | null; setOpenDeadline: (id: number | null) => void; updateDraft: (id: string, patch: Partial<LocalOrder>) => void; move: (id: number, direction: -1 | 1) => void }) { return (
          <>
            <Text style={styles.title}>Ordem de distribuidores</Text>
            <Text style={styles.help}>
              Escolha até {MAX_DISTRIBUTORS}. O primeiro da lista recebe o pedido antes dos demais.
            </Text>
            <Text style={styles.section}>
              Ordem de envio ({selected.length}/{MAX_DISTRIBUTORS})
            </Text>
            {selected.length === 0 ? <Text style={styles.meta}>Adicione um distribuidor da lista abaixo e escolha o prazo.</Text> : null}
            {selected.map((distributorId, index) => {
              const item = released.find((entry) => entry.id === distributorId);
              return (
                <View key={distributorId} style={styles.distributorCard}>
                  <View style={styles.distributorHead}>
                    <View style={styles.priority}><Text style={styles.priorityText}>{index + 1}</Text></View>
                    <Text style={[styles.name, { flex: 1 }]}>{item?.name ?? 'Distribuidor indisponível'}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item?.name ?? 'distribuidor'} da ordem de envio`} style={styles.iconAction} onPress={() => {
                      const next = { ...prazos }; delete next[distributorId];
                      updateDraft(order.id, { distributorIds: selected.filter(entry => entry !== distributorId), prazos: next });
                      if (openDeadline === distributorId) setOpenDeadline(null);
                    }}><AppIcon name="x" color={colors.muted} size={18} /></Pressable>
                  </View>
                  <View style={styles.distributorTools}>
                    <Pressable accessibilityRole="button" accessibilityState={{ expanded: openDeadline === distributorId }} accessibilityLabel={`Prazo de ${item?.name ?? 'distribuidor'}: ${item?.prazos.includes(prazos[distributorId]) ? `${prazos[distributorId]} dias` : 'escolher'}`} onPress={() => setOpenDeadline(openDeadline === distributorId ? null : distributorId)} style={styles.deadline}>
                      <Text style={styles.factLabel}>Prazo</Text><Text style={styles.deadlineValue}>{item?.prazos.includes(prazos[distributorId]) ? `${prazos[distributorId]} dias` : 'Escolher'}</Text><AppIcon name={openDeadline === distributorId ? 'chevron-up' : 'chevron-down'} color={colors.teal} size={16} />
                    </Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Aumentar prioridade de ${item?.name ?? 'distribuidor'}`} accessibilityState={{ disabled: index === 0 }} disabled={index === 0} style={[styles.iconAction, index === 0 && styles.disabled]} onPress={() => move(distributorId, -1)}><AppIcon name="arrow-up" size={18} color={colors.ink} /></Pressable>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Diminuir prioridade de ${item?.name ?? 'distribuidor'}`} accessibilityState={{ disabled: index === selected.length - 1 }} disabled={index === selected.length - 1} style={[styles.iconAction, index === selected.length - 1 && styles.disabled]} onPress={() => move(distributorId, 1)}><AppIcon name="arrow-down" size={18} color={colors.ink} /></Pressable>
                  </View>
                  {openDeadline === distributorId ? <View style={styles.deadlineOptions} accessibilityRole="radiogroup" accessibilityLabel={`Prazos de ${item?.name}`}>
                    {(item?.prazos ?? []).map(days => <Pressable key={days} accessibilityRole="radio" accessibilityState={{ checked: prazos[distributorId] === days }} accessibilityLabel={`${days} dias para ${item?.name}`} onPress={() => { updateDraft(order.id, { prazos: { ...prazos, [distributorId]: days } }); setOpenDeadline(null); }} style={[styles.deadlineChoice, prazos[distributorId] === days && styles.deadlineChoiceOn]}><Text style={styles.deadlineValue}>{days} dias</Text>{prazos[distributorId] === days ? <AppIcon name="check" size={14} color={colors.teal} /> : null}</Pressable>)}
                    {!item?.prazos.length ? <Text style={styles.factLabel}>Nenhum prazo disponível. Atualize os dados.</Text> : null}
                  </View> : null}
                </View>
              );
            })}
            <Text style={styles.section}>Liberados</Text>
            {released
              .filter((item) => !selected.includes(item.id))
              .map((item) => {
                const full = selected.length >= MAX_DISTRIBUTORS;
                return (
                  <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Adicionar ${item.name} à ordem de envio`} accessibilityState={{ disabled: full }} disabled={full}
                    onPress={() => { updateDraft(order.id, { distributorIds: [...selected, item.id] }); setOpenDeadline(item.id); }} style={[styles.available, full && styles.disabled]}>
                    <View style={{ flex: 1 }}><Text style={styles.name}>{item.name}</Text><Text style={styles.factLabel}>{full ? 'Limite de 6 atingido' : `Prazos de ${item.prazos.join(', ')} dias`}</Text></View>
                    <AppIcon name="plus-circle" size={22} color={colors.teal} />
                  </Pressable>
                );
              })}
          </>
        ); }
