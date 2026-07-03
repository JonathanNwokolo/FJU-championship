/**
 * Bloco 10.4 — Fase 4: gate da flag de criação do formato grupos + mata-mata.
 *
 * Cobre o comportamento da tela com a flag LIGADA (estado atual pós-gate):
 * o card deixa de ser "Em breve", a seção de config aparece, a config válida
 * salva `groupStageConfig` e a inválida bloqueia. Também confirma que os
 * formatos antigos continuam salvando sem `groupStageConfig`.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';
import {
  CreateChampionshipScreen,
  GROUPS_FORMAT_UI_ENABLED,
} from '../screens/championship/CreateChampionshipScreen';
import { useAuthStore } from '../stores/authStore';
import { setDocument } from '../services/index';

const mockReplace = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), replace: mockReplace }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');

jest.mock('react-native-draggable-flatlist', () => {
  const React2 = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ data, renderItem }: any) => (
      <View>
        {data.map((item: any, index: number) =>
          React2.cloneElement(
            renderItem({ item, drag: jest.fn(), isActive: false, getIndex: () => index }),
            { key: item.key },
          ),
        )}
      </View>
    ),
    ScaleDecorator: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('../services/index', () => ({
  setDocument: jest.fn((_col: string, id: string) => Promise.resolve(id)),
}));

const mockSetDocument = setDocument as jest.MockedFunction<typeof setDocument>;

const GROUPS_LABEL = /^Grupos \+ mata-mata\./;
const KNOCKOUT_LABEL = /^Mata-mata\. Elimina/;

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  // Alert é o único efeito colateral de handleCreate após o save; silenciá-lo
  // evita que a conclusão assíncrona vaze act() para o próximo teste.
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useAuthStore.setState({
    user: { id: 'org-1', name: 'Org', role: 'organizador' },
    isLoading: false,
    isOnboarded: true,
  } as any);
});

afterEach(async () => {
  // Deixa qualquer atualização assíncrona pendente (render assíncrona + efeitos)
  // liquidar antes de desmontar, evitando vazamento de act() para o próximo teste.
  await act(async () => {
    await Promise.resolve();
  });
  cleanup();
  alertSpy.mockRestore();
});

describe('CreateChampionshipScreen — flag do formato grupos + mata-mata', () => {
  it('a flag está LIGADA após o gate da Fase 4', () => {
    expect(GROUPS_FORMAT_UI_ENABLED).toBe(true);
  });

  it('com a flag ligada o card não exibe "Em breve"', async () => {
    const view = await render(<CreateChampionshipScreen />);
    expect(view.getByText('Grupos + mata-mata')).toBeTruthy();
    expect(view.queryByText('Em breve')).toBeNull();
    // O card está acessível como botão não desabilitado.
    expect(view.getByLabelText(GROUPS_LABEL).props.accessibilityState.disabled).toBe(false);
  });

  it('selecionar o formato revela a seção de configuração da fase de grupos', async () => {
    const view = await render(<CreateChampionshipScreen />);
    expect(view.queryByText('FASE DE GRUPOS')).toBeNull();

    fireEvent.press(await view.findByLabelText(GROUPS_LABEL));

    expect(await view.findByText('FASE DE GRUPOS')).toBeTruthy();
    // Campos suportados aparecem…
    expect(view.getByText('2 (fixo)')).toBeTruthy();
    expect(view.getByText('Sorteio aleatório')).toBeTruthy();
    expect(view.getByLabelText(/Classificados por grupo/)).toBeTruthy();
    // …e a opção não suportada "melhores terceiros" continua oculta.
    expect(view.queryByText(/terceiro/i)).toBeNull();
    expect(view.queryByText(/melhores terceiros/i)).toBeNull();
  });

  it('salva groupStageConfig válida ao criar no formato grupos + mata-mata', async () => {
    const view = await render(<CreateChampionshipScreen />);
    fireEvent.changeText(await view.findByLabelText('Nome do campeonato'), 'Copa Grupos');
    await view.findByDisplayValue('Copa Grupos');
    fireEvent.press(await view.findByLabelText(GROUPS_LABEL));
    fireEvent.press(await view.findByLabelText('Criar campeonato'));

    await waitFor(() => expect(mockSetDocument).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const saved = mockSetDocument.mock.calls[0][2] as any;
    expect(saved.format).toBe('grupos_e_mata_mata');
    expect(saved.groupStageConfig).toMatchObject({
      groupCount: 2,
      qualifiersPerGroup: 2,
      includeBestThirdPlaced: false,
      bestThirdPlacedCount: 0,
      drawMethod: 'random',
    });
    expect(saved.groupStageStatus).toBe('not_generated');
    expect(saved.knockoutStageStatus).toBe('not_generated');
  });

  it('formato antigo (pontos corridos) continua salvando sem groupStageConfig', async () => {
    const view = await render(<CreateChampionshipScreen />);
    fireEvent.changeText(await view.findByLabelText('Nome do campeonato'), 'Liga FJU');
    await view.findByDisplayValue('Liga FJU');
    fireEvent.press(await view.findByLabelText('Criar campeonato'));

    await waitFor(() => expect(mockSetDocument).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const saved = mockSetDocument.mock.calls[0][2] as any;
    expect(saved.format).toBe('pontos_corridos');
    expect(saved.groupStageConfig).toBeUndefined();
  });

  it('formato antigo (mata-mata simples) continua salvando sem groupStageConfig', async () => {
    const view = await render(<CreateChampionshipScreen />);
    fireEvent.changeText(await view.findByLabelText('Nome do campeonato'), 'Copa Mata-mata');
    await view.findByDisplayValue('Copa Mata-mata');
    fireEvent.press(await view.findByLabelText(KNOCKOUT_LABEL));
    fireEvent.press(await view.findByLabelText('Criar campeonato'));

    await waitFor(() => expect(mockSetDocument).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const saved = mockSetDocument.mock.calls[0][2] as any;
    expect(saved.format).toBe('mata_mata');
    expect(saved.groupStageConfig).toBeUndefined();
  });

  // Mantido por último: o caminho de retorno antecipado (config inválida) deixa a
  // render assíncrona deste screen pesado em um estado que a harness não liquida
  // entre testes; posicioná-lo no fim evita contaminar os demais sem perder cobertura.
  it('config inválida bloqueia o save e não grava nada', async () => {
    const view = await render(<CreateChampionshipScreen />);
    fireEvent.changeText(await view.findByLabelText('Nome do campeonato'), 'Copa Grupos');
    await view.findByDisplayValue('Copa Grupos');
    fireEvent.press(await view.findByLabelText(GROUPS_LABEL));
    // Máximo de times abaixo do mínimo estrutural (4) torna a config inválida.
    const maxTeamsInput = view.getByDisplayValue('16');
    fireEvent.changeText(maxTeamsInput, '3');
    await waitFor(() => expect(maxTeamsInput.props.value).toBe('3'));
    fireEvent.press(await view.findByLabelText('Criar campeonato'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Configuração de grupos inválida',
        expect.any(String),
      ),
    );
    expect(mockSetDocument).not.toHaveBeenCalled();
  });
});
