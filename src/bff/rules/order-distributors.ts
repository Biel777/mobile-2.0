import { MAX_DISTRIBUTORS, type Distributor, type ValidationIssue } from './types';

/** Re-check persisted selections against the current release, without dropping unavailable IDs. */
export function validateDistributorSelection(input: {
  selected: number[];
  prazos: Record<number, number>;
  released: Distributor[];
}): ValidationIssue[] {
  const { selected, prazos, released } = input;
  const issues: ValidationIssue[] = [];
  if (!selected.length)
    issues.push({ code: 'NO_DIST', message: 'Monte a ordem de distribuidores.', blocking: true });
  if (selected.length > MAX_DISTRIBUTORS)
    issues.push({
      code: 'MAX_DIST',
      message: `A ordem aceita no máximo ${MAX_DISTRIBUTORS} distribuidores.`,
      blocking: true,
    });
  if (new Set(selected).size !== selected.length)
    issues.push({
      code: 'DUPLICATE_DIST',
      message: 'Um distribuidor aparece mais de uma vez na ordem de envio.',
      blocking: true,
    });
  for (const id of new Set(selected)) {
    const distributor = released.find((item) => item.id === id);
    if (!distributor) {
      issues.push({
        code: `UNAVAILABLE_DIST_${id}`,
        message:
          'Há um distribuidor que não está mais liberado para esta loja. Revise a ordem de envio.',
        blocking: true,
      });
      continue;
    }
    if (prazos[id] === undefined) {
      issues.push({
        code: `NO_PRAZO_${id}`,
        message: `Escolha o prazo de ${distributor.name}.`,
        blocking: true,
      });
    } else if (!distributor.prazos.includes(prazos[id])) {
      issues.push({
        code: `INVALID_PRAZO_${id}`,
        message: `O prazo de ${distributor.name} não está mais disponível. Escolha um prazo liberado.`,
        blocking: true,
      });
    }
  }
  return issues;
}
