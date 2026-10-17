import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-router', () => ({ router: { push: vi.fn() } }));
vi.mock('./store', () => ({ useAppStore: { getState: vi.fn() } }));
import { router } from 'expo-router';
import { useAppStore } from './store';
import { fixtures } from './fixtures';
import { startOrderForPdv } from './order-entry';

beforeEach(() => vi.clearAllMocks());
function setup(catalog = fixtures) {
  const createDraft = vi.fn(() => 'draft-selected-store');
  vi.mocked(useAppStore.getState).mockReturnValue({ catalog, createDraft } as unknown as ReturnType<typeof useAppStore.getState>);
  return createDraft;
}
describe('atalho de pedido na positivação', () => {
  it('abre a condição da loja selecionada quando seu cadastro está disponível', () => {
    const createDraft = setup();
    startOrderForPdv({ id: 22, name: 'Farmácia São José', city: 'Jundiaí/SP' });
    expect(createDraft).toHaveBeenCalledWith(22, 202, 'Farmácia São José');
    expect(router.push).toHaveBeenCalledWith('/pedido/draft-selected-store');
  });
  it('preserva a loja ausente no cache e abre a digitação para sincronizar, sem trocar de cliente', () => {
    const createDraft = setup();
    startOrderForPdv({ id: 44, name: 'Drogaria do Largo', city: 'Campinas/SP' });
    expect(createDraft).toHaveBeenCalledWith(44, 0, 'Drogaria do Largo');
    expect(router.push).toHaveBeenCalledWith('/pedido/draft-selected-store');
  });
  it('não usa uma tabela que não foi carregada no catálogo', () => {
    const catalog = structuredClone(fixtures);
    catalog.tables = [];
    const createDraft = setup(catalog);
    startOrderForPdv({ id: 22, name: 'Farmácia São José', city: 'Jundiaí/SP' });
    expect(createDraft).toHaveBeenCalledWith(22, 0, 'Farmácia São José');
  });
});
