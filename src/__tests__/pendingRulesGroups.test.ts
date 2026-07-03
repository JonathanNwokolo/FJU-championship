import {
  deriveGroupStagePendingItems,
  deriveTeamKnockoutItems,
  matchPhaseLabel,
  resolvePendingDestination,
  sortPendingItems,
} from '../utils/pendingRules';
import { DEFAULT_GROUP_STAGE_CONFIG } from '../utils/groupStageRules';
import { AppUser, Championship, MatchModel, Team } from '../types';

// ── Fábricas ─────────────────────────────────────────────────────────────────

const ORG: AppUser = { id: 'org1', name: 'Org', role: 'organizador' };

function groupsChamp(o: Partial<Championship> = {}): Championship {
  return {
    id: 'gc1',
    name: 'Copa Grupos',
    format: 'grupos_e_mata_mata',
    status: 'inscricoes_abertas',
    currentRound: 1,
    totalRounds: 4,
    organizerId: 'org1',
    inviteCode: 'GC1',
    rules: {
      pointsWin: 3,
      pointsDraw: 1,
      pointsLoss: 0,
      tiebreakers: [],
      fairPlay: false,
      craqueDaRodada: false,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    groupStageConfig: DEFAULT_GROUP_STAGE_CONFIG,
    ...o,
  };
}

function gteam(id: string, group: 'A' | 'B', seed: number, o: Partial<Team> = {}): Team {
  return {
    id,
    championshipId: 'gc1',
    name: `Time ${id}`,
    primaryColor: '#FF0000',
    secondaryColor: '#FFFFFF',
    captainId: `cap_${id}`,
    status: 'aprovado',
    inviteCode: `INV_${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    groupId: group,
    groupSeed: seed,
    groupAssignmentVersion: 1,
    ...o,
  };
}

function groupMatch(o: Partial<MatchModel> = {}): MatchModel {
  return {
    id: 'gm1',
    championshipId: 'gc1',
    round: 1,
    homeTeamId: 't1',
    awayTeamId: 't2',
    homeScore: 2,
    awayScore: 1,
    status: 'finalizado',
    stage: 'group',
    groupId: 'A',
    groupRound: 1,
    structureVersion: 1,
    groupGenerationVersion: 1,
    ...o,
  };
}

function knockoutMatch(o: Partial<MatchModel> = {}): MatchModel {
  return {
    id: 'km1',
    championshipId: 'gc1',
    round: 1,
    homeTeamId: 't1',
    awayTeamId: 't3',
    homeScore: null,
    awayScore: null,
    status: 'agendado',
    stage: 'knockout',
    groupId: null,
    knockoutRound: 1,
    originSnapshotVersion: 1,
    structureVersion: 1,
    ...o,
  };
}

// Cenário de fase de grupos válido e totalmente resolvido (2 grupos de 2 times).
function readyScenario(champOverrides: Partial<Championship> = {}) {
  const championship = groupsChamp({
    stage: 'group_stage',
    status: 'inscricoes_abertas',
    groupStageStatus: 'fixtures_generated',
    groupGenerationVersion: 1,
    groupFixturesVersion: 1,
    ...champOverrides,
  });
  const teams = [
    gteam('t1', 'A', 1),
    gteam('t2', 'A', 2),
    gteam('t3', 'B', 1),
    gteam('t4', 'B', 2),
  ];
  const matches = [
    groupMatch({ id: 'gmA', groupId: 'A', homeTeamId: 't1', awayTeamId: 't2', homeScore: 2, awayScore: 0 }),
    groupMatch({ id: 'gmB', groupId: 'B', homeTeamId: 't3', awayTeamId: 't4', homeScore: 1, awayScore: 0 }),
  ];
  return { championship, teams, matches };
}

// ── Organizador — pendências do formato ──────────────────────────────────────

describe('deriveGroupStagePendingItems — organizador', () => {
  it('grupos não gerados quando há times aprovados suficientes', () => {
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [groupsChamp()],
      teams: [gteam('t1', 'A', 1, { groupId: null, groupAssignmentVersion: undefined }),
        gteam('t2', 'A', 2, { groupId: null, groupAssignmentVersion: undefined }),
        gteam('t3', 'B', 1, { groupId: null, groupAssignmentVersion: undefined }),
        gteam('t4', 'B', 2, { groupId: null, groupAssignmentVersion: undefined })],
      matches: [],
      activeChampionshipId: 'gc1',
    });
    expect(items).toHaveLength(1);
    expect(items[0].type).toBe('group_groups_not_generated');
    expect(items[0].severity).toBe('high');
    expect(items[0].destination).toEqual({ type: 'championship_manage', championshipId: 'gc1' });
  });

  it('não sugere gerar grupos com menos de 4 times', () => {
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [groupsChamp()],
      teams: [gteam('t1', 'A', 1, { groupId: null }), gteam('t2', 'A', 2, { groupId: null })],
      matches: [],
      activeChampionshipId: 'gc1',
    });
    expect(items.some((i) => i.type === 'group_groups_not_generated')).toBe(false);
  });

  it('fixtures não geradas quando grupos existem sem partidas', () => {
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [groupsChamp({ groupStageStatus: 'groups_generated', groupGenerationVersion: 1 })],
      teams: [gteam('t1', 'A', 1), gteam('t2', 'A', 2), gteam('t3', 'B', 1), gteam('t4', 'B', 2)],
      matches: [],
      activeChampionshipId: 'gc1',
    });
    expect(items.some((i) => i.type === 'group_fixtures_not_generated')).toBe(true);
    expect(items.find((i) => i.type === 'group_fixtures_not_generated')?.destination).toEqual({
      type: 'groups_overview',
      championshipId: 'gc1',
    });
  });

  it('estrutura inválida quando time fica sem grupo após geração', () => {
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [groupsChamp({ groupStageStatus: 'groups_generated', groupGenerationVersion: 1 })],
      teams: [
        gteam('t1', 'A', 1),
        gteam('t2', 'A', 2),
        gteam('t3', 'B', 1),
        gteam('t4', 'B', 2, { groupId: null }),
      ],
      matches: [],
      activeChampionshipId: 'gc1',
    });
    const invalid = items.find((i) => i.type === 'group_structure_invalid');
    expect(invalid).toBeDefined();
    expect(invalid?.severity).toBe('critical');
    expect(invalid?.isBlocked).toBe(true);
  });

  it('fase pronta para conclusão quando tudo resolvido', () => {
    const { championship, teams, matches } = readyScenario();
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [championship],
      teams,
      matches,
      activeChampionshipId: 'gc1',
    });
    const ready = items.find((i) => i.type === 'group_stage_ready');
    expect(ready).toBeDefined();
    expect(ready?.severity).toBe('high');
    expect(ready?.destination).toEqual({ type: 'group_stage_review', championshipId: 'gc1' });
    expect(items.some((i) => i.type === 'group_stage_blocked')).toBe(false);
  });

  it('fase bloqueada quando há partida adiada (blocker operacional)', () => {
    const { championship, teams, matches } = readyScenario();
    matches[0] = { ...matches[0], status: 'adiado', homeScore: null, awayScore: null };
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [championship],
      teams,
      matches,
      activeChampionshipId: 'gc1',
    });
    expect(items.some((i) => i.type === 'group_stage_ready')).toBe(false);
    const blocked = items.find((i) => i.type === 'group_stage_blocked');
    expect(blocked).toBeDefined();
    expect(blocked?.isBlocked).toBe(true);
  });

  it('partida de grupo apenas agendada não gera card de bloqueio (progresso normal)', () => {
    const { championship, teams, matches } = readyScenario();
    matches[0] = { ...matches[0], status: 'agendado', homeScore: null, awayScore: null };
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [championship],
      teams,
      matches,
      activeChampionshipId: 'gc1',
    });
    expect(items.some((i) => i.type === 'group_stage_ready')).toBe(false);
    expect(items.some((i) => i.type === 'group_stage_blocked')).toBe(false);
  });

  it('mata-mata indisponível quando fase concluída sem chave', () => {
    const { championship, teams, matches } = readyScenario({
      groupStageComplete: true,
      groupStageStatus: 'completed',
      stage: 'group_stage_completed',
    });
    // deixa uma partida agendada para não disparar "fase pronta"
    matches[0] = { ...matches[0], status: 'agendado', homeScore: null, awayScore: null };
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [championship],
      teams,
      matches,
      activeChampionshipId: 'gc1',
    });
    const knock = items.find((i) => i.type === 'group_knockout_not_generated');
    expect(knock).toBeDefined();
    expect(knock?.severity).toBe('critical');
  });

  it('ignora campeonato de outro organizador', () => {
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [groupsChamp({ organizerId: 'outro' })],
      teams: [gteam('t1', 'A', 1, { groupId: null }), gteam('t2', 'A', 2, { groupId: null }),
        gteam('t3', 'B', 1, { groupId: null }), gteam('t4', 'B', 2, { groupId: null })],
      matches: [],
      activeChampionshipId: 'gc1',
    });
    expect(items).toHaveLength(0);
  });

  it('ignora campeonatos que não são grupos + mata-mata', () => {
    const items = deriveGroupStagePendingItems({
      user: ORG,
      championships: [groupsChamp({ format: 'pontos_corridos' })],
      teams: [],
      matches: [],
      activeChampionshipId: 'gc1',
    });
    expect(items).toHaveLength(0);
  });

  it('IDs determinísticos evitam duplicação entre chamadas', () => {
    const { championship, teams, matches } = readyScenario();
    const run = () =>
      deriveGroupStagePendingItems({
        user: ORG,
        championships: [championship],
        teams,
        matches,
        activeChampionshipId: 'gc1',
      });
    const a = run();
    const b = run();
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    const merged = sortPendingItems([...a, ...b]);
    expect(merged).toHaveLength(a.length);
  });
});

// ── Classificação / eliminação (capitão e atleta) ────────────────────────────

describe('deriveTeamKnockoutItems', () => {
  const champ = groupsChamp({ stage: 'knockout', knockoutStageStatus: 'generated' });

  it('classificado + próxima eliminatória definida', () => {
    const items = deriveTeamKnockoutItems({
      role: 'capitao',
      championship: champ,
      team: gteam('t1', 'A', 1),
      matches: [knockoutMatch({ homeTeamId: 't1', awayTeamId: 't3' })],
      ownerId: 't1',
    });
    expect(items.some((i) => i.type === 'team_qualified')).toBe(true);
    const qualified = items.find((i) => i.type === 'team_qualified');
    expect(qualified?.severity).toBe('info');
    expect(qualified?.destination).toEqual({ type: 'knockout_bracket', championshipId: 'gc1' });
    const defined = items.find((i) => i.type === 'knockout_match_defined');
    expect(defined).toBeDefined();
    expect(defined?.destination).toEqual({ type: 'match_prematch', matchId: 'km1' });
  });

  it('não marca próxima eliminatória quando o slot do adversário está vazio', () => {
    const items = deriveTeamKnockoutItems({
      role: 'atleta',
      championship: champ,
      team: gteam('t1', 'A', 1),
      matches: [knockoutMatch({ homeTeamId: 't1', awayTeamId: '' })],
      ownerId: 'p1',
    });
    expect(items.some((i) => i.type === 'team_qualified')).toBe(true);
    expect(items.some((i) => i.type === 'knockout_match_defined')).toBe(false);
  });

  it('eliminado quando participou dos grupos e não está na chave', () => {
    const items = deriveTeamKnockoutItems({
      role: 'atleta',
      championship: champ,
      team: gteam('t2', 'A', 2),
      matches: [knockoutMatch({ homeTeamId: 't1', awayTeamId: 't3' })],
      ownerId: 'p2',
    });
    expect(items.some((i) => i.type === 'team_eliminated')).toBe(true);
    expect(items.find((i) => i.type === 'team_eliminated')?.destination).toEqual({
      type: 'groups_overview',
      championshipId: 'gc1',
    });
  });

  it('não deriva nada antes do mata-mata ser gerado', () => {
    const items = deriveTeamKnockoutItems({
      role: 'capitao',
      championship: groupsChamp(),
      team: gteam('t1', 'A', 1),
      matches: [],
      ownerId: 't1',
    });
    expect(items).toHaveLength(0);
  });

  it('IDs de classificado usam championshipId + teamId', () => {
    const items = deriveTeamKnockoutItems({
      role: 'capitao',
      championship: champ,
      team: gteam('t1', 'A', 1),
      matches: [knockoutMatch({ homeTeamId: 't1', awayTeamId: 't3' })],
      ownerId: 't1',
    });
    expect(items.find((i) => i.type === 'team_qualified')?.id).toBe('team_qualified_gc1_t1');
  });
});

// ── Contexto de fase e destinos ──────────────────────────────────────────────

describe('matchPhaseLabel', () => {
  it('rotula partida de grupo', () => {
    expect(matchPhaseLabel(groupMatch({ groupId: 'A' }), groupsChamp())).toBe('Grupo A');
  });
  it('rotula partida de mata-mata', () => {
    expect(matchPhaseLabel(knockoutMatch(), groupsChamp())).toBe('Mata-mata');
  });
  it('retorna null fora de grupos + mata-mata', () => {
    expect(matchPhaseLabel(groupMatch(), groupsChamp({ format: 'pontos_corridos' }))).toBeNull();
  });
});

describe('resolvePendingDestination — destinos de grupos', () => {
  it('groups_overview → GroupsOverview', () => {
    expect(resolvePendingDestination({ type: 'groups_overview', championshipId: 'gc1' })).toEqual({
      stack: 'fixtures',
      screen: 'GroupsOverview',
      params: { championshipId: 'gc1' },
    });
  });

  it('group_fixtures com groupId', () => {
    expect(
      resolvePendingDestination({ type: 'group_fixtures', championshipId: 'gc1', groupId: 'B' }),
    ).toEqual({
      stack: 'fixtures',
      screen: 'GroupFixtures',
      params: { championshipId: 'gc1', groupId: 'B' },
    });
  });

  it('group_stage_review exige organizador', () => {
    expect(
      resolvePendingDestination({ type: 'group_stage_review', championshipId: 'gc1' }, 'atleta'),
    ).toBeNull();
    expect(
      resolvePendingDestination({ type: 'group_stage_review', championshipId: 'gc1' }, 'organizador'),
    ).toEqual({ stack: 'fixtures', screen: 'GroupStageReview', params: { championshipId: 'gc1' } });
  });

  it('knockout_bracket cai em FixturesMain', () => {
    expect(resolvePendingDestination({ type: 'knockout_bracket', championshipId: 'gc1' })).toEqual({
      stack: 'fixtures',
      screen: 'FixturesMain',
    });
  });
});
