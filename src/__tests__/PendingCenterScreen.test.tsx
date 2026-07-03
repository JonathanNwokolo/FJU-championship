import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { PendingCenterScreen } from '../screens/home/PendingCenterScreen';
import { usePendingItems, UsePendingItemsResult } from '../hooks/usePendingItems';
import { useAuthStore } from '../stores/authStore';
import { PendingGroup, PendingItem } from '../types/pending';

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockParentNavigate = jest.fn();
const mockRefresh = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    getParent: () => ({ navigate: mockParentNavigate }),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../hooks/usePendingItems', () => ({
  usePendingItems: jest.fn(),
}));

const mockUsePendingItems = usePendingItems as jest.MockedFunction<typeof usePendingItems>;

function item(overrides: Partial<PendingItem> = {}): PendingItem {
  return {
    id: 'pending-1',
    role: 'organizador',
    type: 'match_overdue',
    category: 'matches',
    severity: 'critical',
    title: 'Partida atrasada sem resultado',
    description: 'Rodada 1 passou da data sem resultado.',
    actionLabel: 'Abrir partida',
    destination: { type: 'match_prematch', matchId: 'm1' },
    championshipId: 'c1',
    championshipName: 'Copa Teste',
    matchId: 'm1',
    dueAt: '2026-06-29T10:00:00.000Z',
    deadlineTag: 'overdue',
    isBlocked: true,
    ...overrides,
  };
}

function grouped(items: PendingItem[]): PendingGroup[] {
  const byCategory = new Map<PendingItem['category'], PendingItem[]>();
  for (const pending of items) {
    byCategory.set(pending.category, [...(byCategory.get(pending.category) ?? []), pending]);
  }
  return Array.from(byCategory.entries()).map(([category, data]) => ({
    category,
    label: category === 'matches' ? 'Partidas' : category === 'teams' ? 'Times' : 'Elenco',
    items: data,
  }));
}

function mockHook(overrides: Partial<UsePendingItemsResult> = {}) {
  const items = overrides.items ?? [];
  const criticalItems = overrides.criticalItems ?? items.filter((pending) => pending.severity === 'critical');
  mockUsePendingItems.mockReturnValue({
    items,
    criticalItems,
    groups: overrides.groups ?? grouped(items),
    total: overrides.total ?? items.length,
    criticalCount: overrides.criticalCount ?? criticalItems.length,
    loading: false,
    error: null,
    refresh: mockRefresh,
    hasFreshScopedData: true,
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUsePendingItems.mockReset();
  useAuthStore.setState({
    user: { id: 'u1', name: 'Org', role: 'organizador' },
    isLoading: false,
    isOnboarded: true,
  });
});

describe('PendingCenterScreen', () => {
  it('renders loading state', async () => {
    mockHook({ loading: true });

    const view = await render(<PendingCenterScreen />);

    expect(view.getByLabelText(/Carregando/)).toBeTruthy();
  });

  it('renders error state and refresh action', async () => {
    mockHook({ error: 'Falha parcial', items: [item()] });

    const view = await render(<PendingCenterScreen />);

    expect(view.getByText('Falha parcial')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Tentar novamente'));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders empty state', async () => {
    mockHook();

    const view = await render(<PendingCenterScreen />);

    expect(view.getByText(/em dia/)).toBeTruthy();
  });

  it('renders grouped list with critical and overdue accessible text', async () => {
    mockHook({ items: [item()] });

    const view = await render(<PendingCenterScreen />);

    expect(view.getByText('PARTIDAS')).toBeTruthy();
    expect(view.getByText('Partida atrasada sem resultado')).toBeTruthy();
    expect(view.getByText(/CR.TICO/)).toBeTruthy();
    expect(view.getByText('Vencido')).toBeTruthy();
    expect(
      view.getByLabelText(/Severidade: Cr.tico. Prazo: Vencido./),
    ).toBeTruthy();
  });

  it('filters by critical and hides unavailable category filters', async () => {
    mockHook({
      items: [
        item(),
        item({
          id: 'team-1',
          type: 'team_pending_approval',
          category: 'teams',
          severity: 'high',
          title: 'Time aguardando aprovacao',
          description: 'Time pendente.',
          destination: undefined,
        }),
      ],
    });

    const view = await render(<PendingCenterScreen />);

    expect(view.queryByText(/Presen/)).toBeNull();
    fireEvent.press(view.getByLabelText(/Cr.ticas, 1 item/));
    expect(view.getByText('Partida atrasada sem resultado')).toBeTruthy();
    await waitFor(() => expect(view.queryByText('Time aguardando aprovacao')).toBeNull());
  });

  it('refreshes from the header button', async () => {
    mockHook({ items: [item()] });

    const view = await render(<PendingCenterScreen />);
    fireEvent.press(view.getByLabelText(/Atualizar/));

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('navigates valid nested destinations', async () => {
    mockHook({ items: [item()] });

    const view = await render(<PendingCenterScreen />);
    fireEvent.press(view.getByText('Partida atrasada sem resultado'));

    expect(mockParentNavigate).toHaveBeenCalledWith('Confrontos', {
      screen: 'PreMatch',
      params: { matchId: 'm1' },
    });
  });

  it('does not navigate an unavailable destination for the current profile', async () => {
    useAuthStore.setState({
      user: { id: 'ath1', name: 'Atleta', role: 'atleta' },
      isLoading: false,
      isOnboarded: true,
    });
    mockHook({
      items: [
        item({
          id: 'roster-1',
          role: 'atleta',
          type: 'captain_roster_empty',
          category: 'roster',
          title: 'Elenco vazio',
          description: 'Sem elenco.',
          destination: { type: 'roster_manage', teamId: 't1' },
        }),
      ],
    });

    const view = await render(<PendingCenterScreen />);
    fireEvent.press(view.getByText('Elenco vazio'));

    expect(mockParentNavigate).not.toHaveBeenCalled();
  });

  it('renders a card without action as non-button accessible text', async () => {
    mockHook({
      items: [
        item({
          id: 'info-1',
          destination: undefined,
          actionLabel: undefined,
          title: 'Aviso sem acao',
          description: 'Somente informativo.',
        }),
      ],
    });

    const view = await render(<PendingCenterScreen />);

    expect(view.getByLabelText(/Aviso sem acao/).props.accessibilityRole).toBe('text');
  });
});
