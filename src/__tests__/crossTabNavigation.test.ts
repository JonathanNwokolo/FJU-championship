import { navigateToFixtures } from '../navigation/crossTabNavigation';
import { TAB_NAMES } from '../navigation/constants';

describe('navigateToFixtures (cast isolado — §12)', () => {
  it('navega para a stack de Confrontos com screen + params tipados', () => {
    const navigate = jest.fn();
    const nav = { getParent: () => ({ navigate }) };

    const ok = navigateToFixtures(nav, 'GroupStageReview', { championshipId: 'c1' });

    expect(ok).toBe(true);
    expect(navigate).toHaveBeenCalledWith(TAB_NAMES.CONFRONTOS, {
      screen: 'GroupStageReview',
      params: { championshipId: 'c1' },
    });
  });

  it('encaminha para a chave existente (FixturesMain)', () => {
    const navigate = jest.fn();
    const nav = { getParent: () => ({ navigate }) };

    navigateToFixtures(nav, 'FixturesMain', undefined);

    expect(navigate).toHaveBeenCalledWith(TAB_NAMES.CONFRONTOS, {
      screen: 'FixturesMain',
      params: undefined,
    });
  });

  it('retorna false quando não há navegador pai', () => {
    const nav = { getParent: () => undefined };
    expect(navigateToFixtures(nav, 'GroupsOverview', { championshipId: 'c1' })).toBe(false);
  });
});
