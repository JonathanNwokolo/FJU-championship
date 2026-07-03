import type {
  Championship,
  ChampionshipRules,
  GroupStageQualificationSnapshot,
  GroupStandingRow,
  MatchModel,
  Team,
} from '../types';
import {
  buildQualifierOriginMap,
  describeStandingRowForAccessibility,
  filterGroupFixtures,
  getBlockerLabel,
  getGroupServiceErrorMessage,
  getQualifiedStatusLabel,
  getQualifierOriginLabel,
  getTiebreakReasonLabel,
  getWarningLabel,
  isNotableTiebreak,
  summarizeGroupStageDashboard,
} from '../utils/groupStagePresentation';

const CHAMP = 'champ-pres';

const rules: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: [],
  fairPlay: true,
  craqueDaRodada: false,
};

function championship(overrides: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP,
    name: 'Copa Teste',
    format: 'grupos_e_mata_mata',
    status: 'inscricoes_abertas',
    currentRound: 0,
    totalRounds: 3,
    organizerId: 'org-1',
    inviteCode: 'ABC',
    rules,
    createdAt: '2026-01-01',
    groupStageConfig: {
      version: 1,
      groupCount: 2,
      qualifiersPerGroup: 2,
      includeBestThirdPlaced: false,
      bestThirdPlacedCount: 0,
      drawMethod: 'random',
      tiebreakers: ['points', 'wins', 'goal_difference', 'goals_for', 'head_to_head', 'fewest_cards', 'deterministic_draw'],
    },
    ...overrides,
  };
}

function team(id: string, group: 'A' | 'B', seed: number): Team {
  return {
    id,
    championshipId: CHAMP,
    name: id,
    primaryColor: '#111',
    secondaryColor: '#fff',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01',
    groupId: group,
    groupSeed: seed,
    groupAssignmentVersion: 1,
  };
}

function match(overrides: Partial<MatchModel>): MatchModel {
  return {
    id: overrides.id ?? `m-${overrides.homeTeamId}-${overrides.awayTeamId}`,
    championshipId: CHAMP,
    round: 1,
    groupRound: 1,
    stage: 'group',
    groupId: 'A',
    homeTeamId: 'A',
    awayTeamId: 'B',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    ...overrides,
  };
}

const fourTeams = [team('A', 'A', 1), team('B', 'A', 2), team('C', 'B', 1), team('D', 'B', 2)];

describe('labels de apresentação (Partes 10/16/17/42)', () => {
  it('rótulo de desempate humano e sem implementação', () => {
    expect(getTiebreakReasonLabel({ type: 'goal_difference' })).toBe('À frente por saldo de gols');
    expect(getTiebreakReasonLabel({ type: 'deterministic_draw' })).toBe('Definido por critério técnico');
    expect(getTiebreakReasonLabel(null)).toBeNull();
  });

  it('só destaca desempates relevantes', () => {
    expect(isNotableTiebreak({ type: 'points' })).toBe(false);
    expect(isNotableTiebreak({ type: 'head_to_head' })).toBe(true);
    expect(isNotableTiebreak({ type: 'fewest_cards' })).toBe(true);
  });

  it('rótulos de classificação', () => {
    expect(getQualifiedStatusLabel('qualified')).toBe('Classificado');
    expect(getQualifiedStatusLabel('not_qualified')).toBe('Eliminado');
    expect(getQualifiedStatusLabel('undecided')).toBe('Em disputa');
    expect(getQualifiedStatusLabel(undefined)).toBe('Em disputa');
  });

  it('blockers e warnings em linguagem amigável, com fallback', () => {
    expect(getBlockerLabel({ code: 'unresolved_group_match', message: 'x' })).toContain('sem resultado');
    expect(getBlockerLabel({ code: 'live_match_exists', message: 'x' })).toContain('ao vivo');
    expect(getWarningLabel({ code: 'structural_bye_warning', message: 'x' })).toContain('BYE');
    // código desconhecido cai no message
    expect(getBlockerLabel({ code: 'not_owner', message: 'msg cru' })).toBe('msg cru');
  });
});

describe('summarizeGroupStageDashboard (Parte 41)', () => {
  it('formato não-grupos é ignorado', () => {
    const summary = summarizeGroupStageDashboard(
      championship({ format: 'pontos_corridos', groupStageConfig: undefined }),
      [],
      [],
    );
    expect(summary.isGroupsFormat).toBe(false);
    expect(summary.organizerActions).toHaveLength(0);
  });

  it('antes dos grupos: ação de gerar grupos', () => {
    const summary = summarizeGroupStageDashboard(championship(), fourTeams, []);
    expect(summary.hasGeneratedGroups).toBe(false);
    expect(summary.organizerActions).toEqual(['generate_groups']);
  });

  it('grupos gerados sem fixtures: ação de gerar fixtures', () => {
    const champ = championship({
      groupStageStatus: 'groups_generated',
      groupGenerationVersion: 1,
    });
    const summary = summarizeGroupStageDashboard(champ, fourTeams, []);
    expect(summary.hasGeneratedGroups).toBe(true);
    expect(summary.hasGeneratedFixtures).toBe(false);
    expect(summary.organizerActions).toContain('generate_fixtures');
    expect(summary.viewerActions).toContain('view_groups');
  });

  it('fixtures geradas e todas resolvidas: pronta para concluir', () => {
    const champ = championship({
      stage: 'group_stage',
      groupStageStatus: 'fixtures_generated',
      groupGenerationVersion: 1,
      groupFixturesVersion: 1,
    });
    const matches = [
      match({ id: 'ga', groupId: 'A', homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0, status: 'finalizado' }),
      match({ id: 'gb', groupId: 'B', homeTeamId: 'C', awayTeamId: 'D', homeScore: 2, awayScore: 2, status: 'finalizado' }),
    ];
    const summary = summarizeGroupStageDashboard(champ, fourTeams, matches);
    expect(summary.hasGeneratedFixtures).toBe(true);
    expect(summary.expectedTotal).toBe(2);
    expect(summary.resolvedTotal).toBe(2);
    expect(summary.readyToComplete).toBe(true);
    expect(summary.organizerActions).toContain('review_and_complete');
  });

  it('parcial: não fica pronta para concluir', () => {
    const champ = championship({
      stage: 'group_stage',
      groupStageStatus: 'fixtures_generated',
      groupGenerationVersion: 1,
      groupFixturesVersion: 1,
    });
    const matches = [
      match({ id: 'ga', groupId: 'A', homeTeamId: 'A', awayTeamId: 'B', homeScore: 1, awayScore: 0, status: 'finalizado' }),
      match({ id: 'gb', groupId: 'B', homeTeamId: 'C', awayTeamId: 'D', status: 'agendado' }),
    ];
    const summary = summarizeGroupStageDashboard(champ, fourTeams, matches);
    expect(summary.resolvedTotal).toBe(1);
    expect(summary.readyToComplete).toBe(false);
  });

  it('mata-mata gerado: ações de visualização da chave', () => {
    const champ = championship({
      stage: 'knockout',
      groupStageStatus: 'completed',
      knockoutStageStatus: 'generated',
      groupGenerationVersion: 1,
      groupFixturesVersion: 1,
      knockoutGenerationVersion: 1,
    });
    const summary = summarizeGroupStageDashboard(champ, fourTeams, []);
    expect(summary.hasGeneratedKnockout).toBe(true);
    expect(summary.viewerActions).toContain('view_bracket');
    expect(summary.organizerActions).toHaveLength(0);
  });
});

describe('filterGroupFixtures (Parte 43)', () => {
  const champ = championship({
    stage: 'group_stage',
    groupStageStatus: 'fixtures_generated',
    groupGenerationVersion: 1,
    groupFixturesVersion: 1,
  });
  const matches: MatchModel[] = [
    match({ id: 'a1', groupId: 'A', groupRound: 1, homeTeamId: 'A', awayTeamId: 'B', status: 'finalizado', homeScore: 1, awayScore: 0 }),
    match({ id: 'b1', groupId: 'B', groupRound: 1, homeTeamId: 'C', awayTeamId: 'D', status: 'agendado' }),
    match({ id: 'a2', groupId: 'A', groupRound: 2, homeTeamId: 'A', awayTeamId: 'B', status: 'adiado' }),
    match({ id: 'b2', groupId: 'B', groupRound: 2, homeTeamId: 'C', awayTeamId: 'D', status: 'wo', winnerId: 'C', resultSource: 'wo', homeScore: 3, awayScore: 0 }),
    // partida de liga não deve aparecer
    match({ id: 'lg', stage: 'league', groupId: null, homeTeamId: 'A', awayTeamId: 'C', status: 'finalizado', homeScore: 0, awayScore: 0 }),
  ];

  it('todas: apenas partidas de grupo, ordenadas por rodada', () => {
    const result = filterGroupFixtures(matches, champ, 'todas');
    expect(result.map((m) => m.id)).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('filtra por grupo A e B', () => {
    expect(filterGroupFixtures(matches, champ, 'A').map((m) => m.id)).toEqual(['a1', 'a2']);
    expect(filterGroupFixtures(matches, champ, 'B').map((m) => m.id)).toEqual(['b1', 'b2']);
  });

  it('próximas = agendadas + adiadas', () => {
    expect(filterGroupFixtures(matches, champ, 'proximas').map((m) => m.id).sort()).toEqual(['a2', 'b1']);
  });

  it('finalizadas = finalizado + W.O.', () => {
    expect(filterGroupFixtures(matches, champ, 'finalizadas').map((m) => m.id).sort()).toEqual(['a1', 'b2']);
  });
});

describe('origem do classificado (Partes 10/11)', () => {
  it('rótulo curto "Nº Grupo X"', () => {
    expect(getQualifierOriginLabel(1, 'A')).toBe('1º Grupo A');
    expect(getQualifierOriginLabel(2, 'B')).toBe('2º Grupo B');
  });

  it('mapa de origem a partir do snapshot congelado', () => {
    const snapshot: Pick<GroupStageQualificationSnapshot, 'championshipId' | 'qualifiers'> = {
      championshipId: CHAMP,
      qualifiers: [
        { teamId: 'A', groupId: 'A', groupPosition: 1, points: 6, wins: 2, goalDifference: 3, goalsFor: 4, deterministicSeed: 's1' },
        { teamId: 'C', groupId: 'B', groupPosition: 2, points: 3, wins: 1, goalDifference: 0, goalsFor: 2, deterministicSeed: 's2' },
      ],
    };
    const map = buildQualifierOriginMap(snapshot);
    expect(map.get('A')).toBe('1º Grupo A');
    expect(map.get('C')).toBe('2º Grupo B');
    expect(buildQualifierOriginMap(null).size).toBe(0);
  });
});

describe('getGroupServiceErrorMessage (Parte 14)', () => {
  it('traduz códigos tipados sem vazar código cru', () => {
    expect(getGroupServiceErrorMessage('not_owner')).toContain('organizador');
    expect(getGroupServiceErrorMessage('group_assignments_already_generated')).toContain('já foram gerados');
    expect(getGroupServiceErrorMessage('group_stage_already_completed')).toContain('já foi concluída');
    expect(getGroupServiceErrorMessage('stale_group_transition_version')).toContain('Recarregue');
  });

  it('usa fallback amigável para código desconhecido/ausente', () => {
    expect(getGroupServiceErrorMessage('algum_codigo_novo')).toBe('Não foi possível concluir a ação. Tente novamente.');
    expect(getGroupServiceErrorMessage(null)).toBe('Não foi possível concluir a ação. Tente novamente.');
    expect(getGroupServiceErrorMessage(undefined, 'custom')).toBe('custom');
  });
});

describe('describeStandingRowForAccessibility', () => {
  it('descreve posição, time, pontos e status sem depender de cor', () => {
    const row: GroupStandingRow = {
      teamId: 'A', teamName: 'Leões', primaryColor: '#111', groupId: 'A', position: 1,
      played: 3, wins: 2, draws: 1, losses: 0, goalsFor: 5, goalsAgainst: 2, goalDifference: 3,
      points: 7, woFor: 0, woAgainst: 0, cards: 1, yellowCards: 1, redCards: 0, qualifiedStatus: 'qualified',
    };
    const text = describeStandingRowForAccessibility(row);
    expect(text).toContain('1º lugar');
    expect(text).toContain('Leões');
    expect(text).toContain('Classificado');
  });
});
