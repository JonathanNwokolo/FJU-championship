import { TAB_NAMES } from './constants';
import type { FixturesStackParamList } from './FixturesStackNavigator';

/**
 * Bloco 10.4 — navegação cross-tab tipada para a stack de Confrontos.
 *
 * O root tab navigator não é tipado de ponta a ponta (cada aba é uma stack
 * independente), então o único cast necessário fica ISOLADO e documentado aqui,
 * em vez de espalhar `getParent()` + `as any` pelas telas (§12 da Fase 2).
 *
 * Retorna `false` quando não há navegador pai (ex.: tela montada fora do tab),
 * para que o chamador possa dar um feedback amigável em vez de quebrar.
 */
export function navigateToFixtures<RouteName extends keyof FixturesStackParamList>(
  navigation: { getParent: () => unknown },
  screen: RouteName,
  params: FixturesStackParamList[RouteName],
): boolean {
  const parent = navigation.getParent() as
    | {
        navigate: (
          name: string,
          options: { screen: RouteName; params: FixturesStackParamList[RouteName] },
        ) => void;
      }
    | undefined;
  if (!parent) return false;
  parent.navigate(TAB_NAMES.CONFRONTOS, { screen, params });
  return true;
}
