import type { Championship, Team } from '../types';
import {
  buildFixtures,
  GROUPS_KNOCKOUT_REQUIRES_GROUP_FIXTURE_SERVICE,
} from '../services/fixturesService';

function championship(format: Championship['format']): Championship {
  return {
    id: 'champ-build-fixtures',
    name: 'Copa',
    format,
    status: 'inscricoes_abertas',
    currentRound: 0,
    totalRounds: 0,
    organizerId: 'org',
    inviteCode: 'INV',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: [],
      fairPlay: true,
      craqueDaRodada: false,
    },
    createdAt: '2026-01-01',
  };
}

function team(id: string): Team {
  return {
    id,
    championshipId: 'champ-build-fixtures',
    name: id,
    primaryColor: '#111',
    secondaryColor: '#fff',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01',
  };
}

describe('fixturesService buildFixtures', () => {
  it('bloqueia grupos + mata-mata no gerador legado', () => {
    expect(() =>
      buildFixtures(
        championship('grupos_e_mata_mata'),
        [team('A1'), team('A2'), team('B1'), team('B2')],
      ),
    ).toThrow(GROUPS_KNOCKOUT_REQUIRES_GROUP_FIXTURE_SERVICE);
  });

  it('mantem pontos corridos e mata-mata no caminho existente', () => {
    expect(buildFixtures(championship('pontos_corridos'), [team('A'), team('B')])).toHaveLength(1);
    expect(buildFixtures(championship('mata_mata'), [team('A'), team('B')])).toHaveLength(1);
  });
});
