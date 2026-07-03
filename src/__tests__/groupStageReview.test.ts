import type { Championship, GroupStageConfig, MatchModel, Team } from '../types';
import { DEFAULT_GROUP_STAGE_CONFIG } from '../utils/groupStageRules';
import { getGroupFixtureId, getGroupId } from '../utils/groupStageIds';
import { buildGroupStageReview } from '../utils/groupStageReview';

const CHAMP = 'champ-review';
const GROUP_A = getGroupId(CHAMP, 'A');
const GROUP_B = getGroupId(CHAMP, 'B');

function config(qualifiersPerGroup: number): GroupStageConfig {
  return { ...DEFAULT_GROUP_STAGE_CONFIG, qualifiersPerGroup };
}

function championship(qualifiersPerGroup: number, overrides: Partial<Championship> = {}): Championship {
  return {
    id: CHAMP,
    name: 'Copa Review',
    format: 'grupos_e_mata_mata',
    status: 'em_andamento',
    stage: 'group_stage',
    currentRound: 1,
    totalRounds: 1,
    organizerId: 'org-1',
    inviteCode: 'ABC',
    rules: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: [], fairPlay: true, craqueDaRodada: false },
    createdAt: '2026-01-01',
    groupStageConfig: config(qualifiersPerGroup),
    groupStageStatus: 'fixtures_generated',
    knockoutStageStatus: 'not_generated',
    groupStructureVersion: 1,
    groupGenerationVersion: 1,
    groupFixturesVersion: 1,
    ...overrides,
  };
}

function team(id: string, group: 'A' | 'B', seed: number): Team {
  return {
    id,
    championshipId: CHAMP,
    name: `Team ${id}`,
    primaryColor: '#111111',
    secondaryColor: '#ffffff',
    captainId: `cap-${id}`,
    status: 'aprovado',
    inviteCode: id,
    createdAt: '2026-01-01',
    groupId: group === 'A' ? GROUP_A : GROUP_B,
    groupSeed: seed,
    groupAssignmentVersion: 1,
  };
}

/** N times por grupo, com seeds 1..N. */
function teamsPerGroup(n: number): Team[] {
  const out: Team[] = [];
  for (let i = 1; i <= n; i += 1) {
    out.push(team(`a${i}`, 'A', i));
    out.push(team(`b${i}`, 'B', i));
  }
  return out;
}

/** Round-robin completo por grupo; o de menor seed sempre vence (ranking estável). */
function resolvedMatches(teams: Team[]): MatchModel[] {
  const out: MatchModel[] = [];
  (['A', 'B'] as const).forEach((letter) => {
    const groupId = letter === 'A' ? GROUP_A : GROUP_B;
    const group = teams
      .filter((t) => t.groupId === groupId)
      .sort((x, y) => (x.groupSeed ?? 0) - (y.groupSeed ?? 0));
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        out.push({
          id: getGroupFixtureId(CHAMP, groupId, group[i].id, group[j].id),
          championshipId: CHAMP,
          round: 1,
          groupRound: 1,
          stage: 'group',
          groupId,
          homeTeamId: group[i].id,
          awayTeamId: group[j].id,
          homeScore: 1,
          awayScore: 0,
          status: 'finalizado',
          structureVersion: 1,
          groupGenerationVersion: 1,
          originSnapshotVersion: null,
          nextMatchId: null,
        });
      }
    }
  });
  return out;
}

describe('buildGroupStageReview — classificados, cruzamentos, BYE (Fase 2)', () => {
  it('4 classificados (2 por grupo): sem BYE, 2 cruzamentos, origens rotuladas', () => {
    const teams = teamsPerGroup(2);
    const review = buildGroupStageReview({
      championship: championship(2),
      teams,
      matches: resolvedMatches(teams),
    });

    expect(review.allowed).toBe(true);
    expect(review.blockers).toHaveLength(0);
    expect(review.qualifierCount).toBe(4);
    expect(review.qualifiers).toHaveLength(4);
    expect(review.eliminated).toHaveLength(0);
    expect(review.hasBye).toBe(false);
    expect(review.byeCount).toBe(0);
    expect(review.crossings).not.toBeNull();
    expect(review.crossings).toHaveLength(2);
    // origem "1º Grupo A"
    const leaderA = review.qualifiers.find((q) => q.groupId === 'A' && q.position === 1);
    expect(leaderA?.originLabel).toBe('1º Grupo A');
    // nenhuma partida falsa: todo cruzamento tem ao menos um lado
    for (const crossing of review.crossings!) {
      expect(crossing.home || crossing.away).toBeTruthy();
    }
  });

  it('2 classificados (1 por grupo): 1 cruzamento, eliminados preenchidos', () => {
    const teams = teamsPerGroup(2);
    const review = buildGroupStageReview({
      championship: championship(1),
      teams,
      matches: resolvedMatches(teams),
    });

    expect(review.allowed).toBe(true);
    expect(review.qualifierCount).toBe(2);
    expect(review.eliminated).toHaveLength(2);
    expect(review.crossings).toHaveLength(1);
    expect(review.hasBye).toBe(false);
  });

  it('6 classificados (3 por grupo): BYE estrutural com 2 avanços automáticos', () => {
    const teams = teamsPerGroup(3);
    const review = buildGroupStageReview({
      championship: championship(3),
      teams,
      matches: resolvedMatches(teams),
    });

    expect(review.allowed).toBe(true);
    expect(review.qualifierCount).toBe(6);
    expect(review.hasBye).toBe(true);
    expect(review.byeCount).toBe(2);
    expect(review.crossings).toHaveLength(4);
    const byes = review.crossings!.filter((c) => c.isBye);
    expect(byes).toHaveLength(2);
    // BYE nunca é "time × vazio" jogável: exatamente um lado ocupado
    for (const bye of byes) {
      expect(!!bye.home !== !!bye.away).toBe(true);
    }
  });

  it('8 classificados (4 por grupo): chave cheia sem BYE', () => {
    const teams = teamsPerGroup(4);
    const review = buildGroupStageReview({
      championship: championship(4),
      teams,
      matches: resolvedMatches(teams),
    });

    expect(review.allowed).toBe(true);
    expect(review.qualifierCount).toBe(8);
    expect(review.byeCount).toBe(0);
    expect(review.hasBye).toBe(false);
    expect(review.crossings).toHaveLength(4);
    expect(review.crossings!.every((c) => !c.isBye)).toBe(true);
  });

  it('blocker: partida agendada impede conclusão mas mostra classificação provisória', () => {
    const teams = teamsPerGroup(2);
    const matches = resolvedMatches(teams);
    matches[0] = { ...matches[0], status: 'agendado', homeScore: null, awayScore: null };
    const review = buildGroupStageReview({ championship: championship(2), teams, matches });

    expect(review.allowed).toBe(false);
    expect(review.blockers.map((b) => b.code)).toContain('unresolved_group_match');
    // ainda exibe os classificados provisórios
    expect(review.qualifiers.length).toBeGreaterThan(0);
  });

  it('warning estrutural de BYE aparece sem bloquear', () => {
    const teams = teamsPerGroup(3);
    const review = buildGroupStageReview({
      championship: championship(3),
      teams,
      matches: resolvedMatches(teams),
    });
    expect(review.allowed).toBe(true);
    expect(review.warnings.map((w) => w.code)).toContain('structural_bye_warning');
  });

  it('é puro: não muta entradas e é determinístico', () => {
    const teams = teamsPerGroup(2);
    const matches = resolvedMatches(teams);
    const teamsLen = teams.length;
    const matchesLen = matches.length;
    const first = buildGroupStageReview({ championship: championship(2), teams, matches });
    const second = buildGroupStageReview({ championship: championship(2), teams, matches });
    expect(teams).toHaveLength(teamsLen);
    expect(matches).toHaveLength(matchesLen);
    expect(first.crossings).toEqual(second.crossings);
    expect(first.qualifiers).toEqual(second.qualifiers);
  });
});
