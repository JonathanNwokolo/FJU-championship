/**
 * Bloco 11 — Domínio PURO do reprocessamento de campeonato encerrado.
 *
 * Recomputa, sem efeitos colaterais, o desfecho de um campeonato
 * (`championship_results` + linhas de `player_history` + achievements de fim de
 * campeonato) a partir do estado ATUAL de times/atletas/partidas/eventos/awards,
 * e produz um DIFF contra o estado congelado. Não escreve nada, não usa `now`,
 * não chama Firebase. É a fonte única de verdade do cálculo de desfecho.
 *
 * A lógica espelha exatamente o cálculo de `championshipFinisher.finishChampionship`
 * (mesmos critérios de campeão, vice, artilheiro, MVP, melhor defesa, fair play e
 * achievements). Na Fase 2 o finisher passará a reutilizar este domínio para não
 * duplicar regra. Aqui não há decisão de negócio nova.
 */

import type {
  Achievement,
  AllTimeRankingPlayer,
  AllTimeRankingTeam,
  CareerStats,
  Championship,
  ChampionshipReprocessLog,
  ChampionshipResultData,
  MatchEvent,
  MatchModel,
  Player,
  PlayerHistoryEntry,
  ReprocessAchievementRef,
  RoundAward,
  Team,
} from '../types';
import { calculateStandings, calculateTopScorers } from '../services/statsService';
import { calculateOverall } from './playerOverall';
import { isActiveRosterPlayer } from './teamRules';
import { matchCountsForStandings } from './matchRules';
import { hasGeneratedKnockout, normalizeMatchStage } from './groupStageStructure';

/** Achievements de fim de campeonato reconciliáveis pelo reprocessamento. */
export const END_OF_CHAMPIONSHIP_ACHIEVEMENTS = [
  'campeao',
  'vice_campeao',
  'artilheiro_campeonato',
  'fair_play_campeonato',
] as const;

export type EndOfChampionshipAchievementId =
  (typeof END_OF_CHAMPIONSHIP_ACHIEVEMENTS)[number];

const BRACKET_ROUND_RANK: Record<string, number> = {
  grupo: 0,
  fase_32: 1,
  fase_16: 2,
  oitavas: 3,
  quartas: 4,
  semi: 5,
  final: 6,
};

/**
 * Colapsa `round_awards` duplicados por rodada num único vencedor determinístico
 * (prefere o id determinístico `${championshipId}_${round}`; senão o `closedAt` mais
 * antigo e depois o menor id). Pura — usada pelo desfecho e pelo finisher.
 */
export function dedupeRoundAwards(roundAwards: RoundAward[]): RoundAward[] {
  const byRound = new Map<string, RoundAward[]>();
  for (const award of roundAwards) {
    const key = `${award.championshipId}_${award.round}`;
    byRound.set(key, [...(byRound.get(key) ?? []), award]);
  }

  return [...byRound.entries()].map(([key, awards]) => {
    const deterministic = awards.find((award) => award.id === key);
    if (deterministic) return deterministic;

    const winnerIds = new Set(awards.map((award) => award.winnerPlayerId));
    if (winnerIds.size > 1) {
      console.warn(
        `[championshipFinisher] conflicting legacy round_awards for ${key}; using oldest closedAt then id`,
      );
    }

    return [...awards].sort((a, b) => {
      const closedAtDiff = (a.closedAt ?? '').localeCompare(b.closedAt ?? '');
      if (closedAtDiff !== 0) return closedAtDiff;
      return a.id.localeCompare(b.id);
    })[0];
  });
}

/** Final decidida (inclusive por W.O.) que define o campeão do mata-mata. */
export function getFinalizedKnockoutFinal(matches: MatchModel[]): MatchModel | null {
  return [...matches]
    .filter((match) => matchCountsForStandings(match.status) && !!match.winnerId)
    .sort((a, b) => {
      const rankDiff =
        (BRACKET_ROUND_RANK[b.bracketRound ?? ''] ?? 0) -
        (BRACKET_ROUND_RANK[a.bracketRound ?? ''] ?? 0);
      return rankDiff || b.round - a.round;
    })[0] ?? null;
}

/** Linha recomputada de `player_history` (sem `id`/`finishedAt`, injetados na escrita). */
export interface ReprocessPlayerRow {
  playerId: string;
  userId: string;
  championshipId: string;
  championshipName: string;
  teamId: string;
  teamName: string;
  season: string;
  position: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  matchesPlayed: number;
  overall: number;
  isChampion: boolean;
  isMvp: boolean;
  roundMvpCount: number;
}

export interface ExpectedAchievement {
  playerId: string;
  achievementId: EndOfChampionshipAchievementId;
}

/** `championship_results` recomputado (sem `finishedAt`, injetado na escrita). */
export type ReprocessedResult = Omit<ChampionshipResultData, 'finishedAt'>;

export interface ChampionshipOutcome {
  result: ReprocessedResult;
  playerRows: ReprocessPlayerRow[];
  expectedAchievements: ExpectedAchievement[];
}

export interface ComputeOutcomeInput {
  championship: Championship;
  teams: Team[];
  players: Player[];
  matches: MatchModel[];
  events: MatchEvent[];
  roundAwards: RoundAward[];
}

/**
 * Recomputa o desfecho do campeonato de forma pura e determinística.
 * Mesmos critérios do finisher; sem escrita e sem timestamp.
 */
export function computeChampionshipOutcome(input: ComputeOutcomeInput): ChampionshipOutcome {
  const { championship, teams, players, matches, events, roundAwards } = input;
  const championshipId = championship.id;

  const matchIds = new Set(matches.map((m) => m.id));
  const champEvents = events.filter((e) => matchIds.has(e.matchId));
  const standingsMatches = matches.filter((m) => matchCountsForStandings(m.status));
  const finishedMatches = matches.filter((m) => m.status === 'finalizado');
  const uniqueRoundAwards = dedupeRoundAwards(roundAwards);

  const standings = calculateStandings(standingsMatches, champEvents, teams, championship.rules);
  const topScorers = calculateTopScorers(champEvents, players, teams);

  const winner = standings[0];
  const runnerUp = standings[1];

  const finalMatch =
    championship.format === 'mata_mata' ? getFinalizedKnockoutFinal(standingsMatches) : null;
  const knockoutWinnerTeam = finalMatch?.winnerId
    ? teams.find((t) => t.id === finalMatch.winnerId)
    : undefined;
  const knockoutRunnerUpId = finalMatch?.winnerId
    ? finalMatch.homeTeamId === finalMatch.winnerId
      ? finalMatch.awayTeamId
      : finalMatch.homeTeamId
    : undefined;
  const knockoutRunnerUpTeam = knockoutRunnerUpId
    ? teams.find((t) => t.id === knockoutRunnerUpId)
    : undefined;

  const winnerTeam = knockoutWinnerTeam ?? teams.find((t) => t.id === winner?.teamId);
  const runnerUpTeam = knockoutRunnerUpTeam ?? teams.find((t) => t.id === runnerUp?.teamId);

  const topScorer = topScorers[0];
  const topScorerPlayer = players.find((p) => p.id === topScorer?.playerId);

  const bestDefense = [...standings].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
  const bestDefenseTeam = teams.find((t) => t.id === bestDefense?.teamId);

  const votesByPlayer: Record<string, { name: string; teamId: string; votes: number }> = {};
  for (const award of uniqueRoundAwards) {
    const key = award.winnerPlayerId;
    if (!votesByPlayer[key]) {
      votesByPlayer[key] = { name: award.winnerName, teamId: award.winnerTeamId, votes: 0 };
    }
    votesByPlayer[key].votes += award.totalVotes;
  }
  const mvpEntry = Object.entries(votesByPlayer).sort((a, b) => b[1].votes - a[1].votes)[0];
  const mvpPlayerId = mvpEntry?.[0];
  const mvpPlayerName = mvpEntry?.[1].name;
  const mvpVotes = mvpEntry?.[1].votes ?? 0;

  const fairPlayTeam = [...standings].sort((a, b) => a.fairPlayScore - b.fairPlayScore)[0];
  const fairPlayTeamData = teams.find((t) => t.id === fairPlayTeam?.teamId);

  const totalGoals = champEvents.filter((e) => e.type === 'gol').length;
  const season = championship.season ?? new Date(championship.createdAt).getFullYear().toString();

  const result: ReprocessedResult = {
    id: championshipId,
    championshipId,
    championshipName: championship.name,
    season,
    format: championship.format,
    totalTeams: teams.length,
    totalPlayers: players.length,
    totalMatches: standingsMatches.length,
    totalGoals,
    winnerId: winnerTeam?.id ?? '',
    winnerName: winnerTeam?.name ?? '',
    winnerTeamColor: winnerTeam?.primaryColor,
    runnerUpId: runnerUpTeam?.id ?? '',
    runnerUpName: runnerUpTeam?.name ?? '',
    topScorerId: topScorerPlayer?.id ?? topScorer?.playerId ?? '',
    topScorerName: topScorerPlayer?.name ?? topScorer?.playerName ?? '',
    topScorerGoals: topScorer?.goals ?? 0,
    bestDefenseId: bestDefenseTeam?.id ?? '',
    bestDefenseName: bestDefenseTeam?.name ?? '',
    bestDefenseGoals: bestDefense?.goalsAgainst ?? 0,
    mvpPlayerId,
    mvpPlayerName,
    mvpVotes,
    fairPlayTeamId: fairPlayTeamData?.id,
    fairPlayTeamName: fairPlayTeamData?.name,
    fairPlayCards: fairPlayTeam?.fairPlayScore,
    organizerId: championship.organizerId,
  };

  const roundMvpCountByPlayerId: Record<string, number> = {};
  for (const award of uniqueRoundAwards) {
    roundMvpCountByPlayerId[award.winnerPlayerId] =
      (roundMvpCountByPlayerId[award.winnerPlayerId] ?? 0) + 1;
  }

  const playerRows: ReprocessPlayerRow[] = [];
  const expectedAchievements: ExpectedAchievement[] = [];

  for (const player of players) {
    const goals = champEvents.filter((e) => e.type === 'gol' && e.playerId === player.id).length;
    const assists = champEvents.filter(
      (e) => e.type === 'assistencia' && e.playerId === player.id,
    ).length;
    const yellowCards = champEvents.filter(
      (e) => e.type === 'cartao_amarelo' && e.playerId === player.id,
    ).length;
    const redCards = champEvents.filter(
      (e) => e.type === 'cartao_vermelho' && e.playerId === player.id,
    ).length;
    const matchesPlayed = finishedMatches.filter(
      (m) => m.homeTeamId === player.teamId || m.awayTeamId === player.teamId,
    ).length;

    const team = teams.find((t) => t.id === player.teamId);
    const isChampion = isActiveRosterPlayer(player) && player.teamId === winnerTeam?.id;
    const roundMvpCount = roundMvpCountByPlayerId[player.id] ?? 0;
    const isMvp = roundMvpCount > 0;
    const overall = calculateOverall(goals, yellowCards, redCards, matchesPlayed);

    if (player.userId) {
      playerRows.push({
        playerId: player.id,
        userId: player.userId,
        championshipId,
        championshipName: championship.name,
        teamId: player.teamId ?? '',
        teamName: team?.name ?? '',
        season,
        position: player.position,
        goals,
        assists,
        yellowCards,
        redCards,
        matchesPlayed,
        overall,
        isChampion,
        isMvp,
        roundMvpCount,
      });
    }

    // Achievements de fim de campeonato esperados (mesmas condições do finisher).
    if (isChampion) expectedAchievements.push({ playerId: player.id, achievementId: 'campeao' });
    if (isActiveRosterPlayer(player) && player.teamId === runnerUpTeam?.id) {
      expectedAchievements.push({ playerId: player.id, achievementId: 'vice_campeao' });
    }
    if (topScorerPlayer && player.id === topScorerPlayer.id) {
      expectedAchievements.push({ playerId: player.id, achievementId: 'artilheiro_campeonato' });
    }
    if (yellowCards === 0 && redCards === 0 && matchesPlayed > 0) {
      expectedAchievements.push({ playerId: player.id, achievementId: 'fair_play_campeonato' });
    }
  }

  return { result, playerRows, expectedAchievements };
}

// ── Diff entre o congelado e o recomputado ───────────────────────────────────

/** Campos de topo do `championship_results` que, ao mudar, marcam reprocessamento. */
export const REPROCESS_RESULT_FIELDS = [
  'winnerId',
  'runnerUpId',
  'topScorerId',
  'topScorerGoals',
  'bestDefenseId',
  'mvpPlayerId',
  'fairPlayTeamId',
  'totalGoals',
  'totalMatches',
] as const;

export interface HistoryDelta {
  userId: string;
  before: Partial<ReprocessPlayerRow> | null;
  after: ReprocessPlayerRow;
  changedFields: string[];
}

export interface AchievementReconciliation {
  grant: ExpectedAchievement[];
  revoke: ExpectedAchievement[];
}

export interface OutcomeDiff {
  hasChanges: boolean;
  changedResultFields: string[];
  championChanged: boolean;
  topScorerChanged: boolean;
  mvpChanged: boolean;
  historyDeltas: HistoryDelta[];
  achievements: AchievementReconciliation;
}

type FrozenHistory = Pick<
  ReprocessPlayerRow,
  'userId' | 'goals' | 'assists' | 'yellowCards' | 'redCards' | 'matchesPlayed' | 'overall' | 'isChampion' | 'isMvp' | 'roundMvpCount' | 'teamId' | 'teamName'
>;

export interface DiffInput {
  frozenResult: Pick<ChampionshipResultData, (typeof REPROCESS_RESULT_FIELDS)[number]>;
  frozenHistoryByUser: Record<string, FrozenHistory>;
  /** Achievements de fim de campeonato já concedidos NESTE campeonato. */
  frozenAchievements: ExpectedAchievement[];
  recomputed: ChampionshipOutcome;
}

const HISTORY_COMPARED_FIELDS: (keyof FrozenHistory)[] = [
  'goals',
  'assists',
  'yellowCards',
  'redCards',
  'matchesPlayed',
  'overall',
  'isChampion',
  'isMvp',
  'roundMvpCount',
  'teamId',
];

/**
 * Compara o desfecho congelado com o recomputado e devolve exatamente o que
 * precisa mudar: campos do resultado, deltas de histórico por usuário e o plano
 * de reconciliação de achievements (conceder o que passou a valer, revogar o que
 * deixou de valer). Puro e determinístico.
 */
export function diffChampionshipOutcome(input: DiffInput): OutcomeDiff {
  const { frozenResult, frozenHistoryByUser, frozenAchievements, recomputed } = input;

  const changedResultFields: string[] = [];
  for (const field of REPROCESS_RESULT_FIELDS) {
    const before = (frozenResult as Record<string, unknown>)[field] ?? null;
    const after = (recomputed.result as Record<string, unknown>)[field] ?? null;
    if (before !== after) changedResultFields.push(field);
  }

  const historyDeltas: HistoryDelta[] = [];
  for (const row of recomputed.playerRows) {
    const before = frozenHistoryByUser[row.userId] ?? null;
    const changedFields: string[] = [];
    for (const field of HISTORY_COMPARED_FIELDS) {
      const b = before ? (before as Record<string, unknown>)[field] : undefined;
      if (b !== (row as unknown as Record<string, unknown>)[field]) changedFields.push(field);
    }
    if (!before || changedFields.length > 0) {
      historyDeltas.push({ userId: row.userId, before, after: row, changedFields });
    }
  }

  const expectedKeys = new Set(
    recomputed.expectedAchievements.map((a) => `${a.playerId}:${a.achievementId}`),
  );
  const frozenKeys = new Set(frozenAchievements.map((a) => `${a.playerId}:${a.achievementId}`));

  const grant = recomputed.expectedAchievements.filter(
    (a) => !frozenKeys.has(`${a.playerId}:${a.achievementId}`),
  );
  const revoke = frozenAchievements.filter(
    (a) => !expectedKeys.has(`${a.playerId}:${a.achievementId}`),
  );

  const hasChanges =
    changedResultFields.length > 0 ||
    historyDeltas.length > 0 ||
    grant.length > 0 ||
    revoke.length > 0;

  return {
    hasChanges,
    changedResultFields,
    championChanged: changedResultFields.includes('winnerId'),
    topScorerChanged: changedResultFields.includes('topScorerId'),
    mvpChanged: changedResultFields.includes('mvpPlayerId'),
    historyDeltas,
    achievements: { grant, revoke },
  };
}

// ── Career stats (puro) ───────────────────────────────────────────────────────
// Mesma soma de `championshipFinisher.recalcCareerStats`, extraída para ser pura e
// reutilizável pelo reprocessamento (recalcula a partir do histórico COMPLETO do
// usuário, portanto idempotente). O finisher passa a reutilizar esta função.

export interface CareerStatsTotals {
  totalGoals: number;
  totalAssists: number;
  totalMatches: number;
  totalTitles: number;
  totalMvps: number;
  totalChampionships: number;
  bestOverall: number;
  bestSeason: string;
  bestSeasonGoals: number;
  firstSeasonYear: string;
}

export function computeCareerStatsTotals(
  history: Pick<
    PlayerHistoryEntry,
    'goals' | 'assists' | 'matchesPlayed' | 'isChampion' | 'roundMvpCount' | 'overall' | 'season'
  >[],
): CareerStatsTotals | null {
  if (history.length === 0) return null;

  let totalGoals = 0;
  let totalAssists = 0;
  let totalMatches = 0;
  let totalTitles = 0;
  let totalMvps = 0;
  let bestOverall = 0;
  let bestSeasonGoals = 0;
  let bestSeason = history[0].season;
  let firstSeasonYear = history[0].season;

  for (const h of history) {
    totalGoals += h.goals ?? 0;
    totalAssists += h.assists ?? 0;
    totalMatches += h.matchesPlayed ?? 0;
    totalTitles += h.isChampion ? 1 : 0;
    totalMvps += h.roundMvpCount ?? 0;
    bestOverall = Math.max(bestOverall, h.overall ?? 0);
    if ((h.goals ?? 0) > bestSeasonGoals) {
      bestSeasonGoals = h.goals ?? 0;
      bestSeason = h.season;
    }
    if (h.season < firstSeasonYear) firstSeasonYear = h.season;
  }

  return {
    totalGoals,
    totalAssists,
    totalMatches,
    totalTitles,
    totalMvps,
    totalChampionships: history.length,
    bestOverall,
    bestSeason,
    bestSeasonGoals,
    firstSeasonYear,
  };
}

// ── All-time rankings (puro) ──────────────────────────────────────────────────
// Espelha `championshipFinisher.rebuildAllTimeRankings`, extraído para ser puro e
// reutilizável. Devolve os 5 documentos (top 10 por categoria) sem escrever.

export interface AllTimeRankingDocs {
  scorers: { players: AllTimeRankingPlayer[] };
  titles: { players: AllTimeRankingPlayer[] };
  matches: { players: AllTimeRankingPlayer[] };
  mvps: { players: AllTimeRankingPlayer[] };
  teams: { teams: AllTimeRankingTeam[] };
}

export const ALL_TIME_RANKING_CATEGORIES = [
  'scorers',
  'titles',
  'matches',
  'mvps',
  'teams',
] as const;

export function buildAllTimeRankingDocs(input: {
  careerStats: CareerStats[];
  results: Pick<ChampionshipResultData, 'winnerId' | 'winnerName'>[];
  playerHistory: Pick<PlayerHistoryEntry, 'teamName' | 'championshipId'>[];
}): AllTimeRankingDocs {
  const { careerStats, results, playerHistory } = input;

  const toPlayer = (
    s: CareerStats,
  ): Omit<AllTimeRankingPlayer, 'goals' | 'titles' | 'matches' | 'mvps'> => ({
    userId: s.userId,
    name: s.name,
    teamName: s.lastTeamName,
    seasons: s.totalChampionships,
  });

  const scorers = [...careerStats]
    .sort((a, b) => b.totalGoals - a.totalGoals)
    .slice(0, 10)
    .map((s) => ({ ...toPlayer(s), goals: s.totalGoals }));

  const titles = [...careerStats]
    .sort((a, b) => b.totalTitles - a.totalTitles)
    .slice(0, 10)
    .map((s) => ({ ...toPlayer(s), titles: s.totalTitles }));

  const matches = [...careerStats]
    .sort((a, b) => b.totalMatches - a.totalMatches)
    .slice(0, 10)
    .map((s) => ({ ...toPlayer(s), matches: s.totalMatches }));

  const mvps = [...careerStats]
    .sort((a, b) => b.totalMvps - a.totalMvps)
    .slice(0, 10)
    .map((s) => ({ ...toPlayer(s), mvps: s.totalMvps }));

  const teamTitleMap: Record<string, { teamId: string; name: string; titles: number }> = {};
  for (const result of results) {
    if (!result.winnerId || !result.winnerName) continue;
    const key = result.winnerName;
    if (!teamTitleMap[key]) {
      teamTitleMap[key] = { teamId: result.winnerId, name: result.winnerName, titles: 0 };
    }
    teamTitleMap[key].titles += 1;
  }

  const teamParticipationMap: Record<string, Set<string>> = {};
  for (const entry of playerHistory) {
    if (!entry.teamName || !entry.championshipId) continue;
    teamParticipationMap[entry.teamName] ??= new Set<string>();
    teamParticipationMap[entry.teamName].add(entry.championshipId);
  }

  const teams = Object.values(teamTitleMap)
    .sort((a, b) => b.titles - a.titles)
    .slice(0, 10)
    .map((t) => ({
      teamId: t.teamId,
      name: t.name,
      titles: t.titles,
      participations: teamParticipationMap[t.name]?.size ?? t.titles,
    }));

  return {
    scorers: { players: scorers },
    titles: { players: titles },
    matches: { players: matches },
    mvps: { players: mvps },
    teams: { teams },
  };
}

// ── Digest do resultado ───────────────────────────────────────────────────────
// Assinatura estável dos campos competitivos, usada como pré-condição de
// concorrência (o resultado congelado que o plano assumiu ainda é o vigente?) e
// para detectar conflito de reprocessamento (mesmo id, desfecho diferente).

export function digestOutcomeResult(
  result: Pick<ChampionshipResultData, (typeof REPROCESS_RESULT_FIELDS)[number]> &
    Partial<Pick<ChampionshipResultData, 'winnerName' | 'runnerUpName' | 'mvpPlayerName'>>,
): string {
  const fields = [
    ...REPROCESS_RESULT_FIELDS,
    'winnerName',
    'runnerUpName',
    'mvpPlayerName',
  ] as const;
  return fields
    .map((f) => `${f}=${(result as Record<string, unknown>)[f] ?? ''}`)
    .join('|');
}

// ── Erros tipados do reprocessamento ──────────────────────────────────────────

export type ReprocessErrorCode =
  | 'championship_missing'
  | 'championship_not_closed'
  | 'championship_results_missing'
  | 'reprocess_reason_required'
  | 'not_owner'
  | 'reprocess_unsupported_format'
  | 'reprocess_group_stage_locked_after_knockout_generation'
  | 'reprocess_source_match_not_found'
  | 'reprocess_correction_not_applied'
  | 'stale_reprocess_version'
  | 'championship_reprocess_conflict'
  | 'reprocess_no_effect'
  | 'achievement_reconciliation_conflict'
  | 'career_stats_rebuild_failed'
  | 'rankings_rebuild_failed';

export class ReprocessError extends Error {
  code: ReprocessErrorCode;
  constructor(code: ReprocessErrorCode, message: string) {
    super(message);
    this.name = 'ReprocessError';
    this.code = code;
  }
}

const SUPPORTED_FORMATS = new Set<Championship['format']>([
  'pontos_corridos',
  'mata_mata',
  'grupos_e_mata_mata',
]);

// ── Plano de reprocessamento (puro) ───────────────────────────────────────────

export interface ReprocessInput {
  reason: string;
  organizerId: string;
  sourceCorrectionId: string;
  /** Partida corrigida (estado PÓS-correção); precisa ter `lastCorrectionId` == sourceCorrectionId. */
  sourceMatch: MatchModel;
  /** Versão de reprocessamento atualmente congelada em `championship_results` (default 0). */
  expectedReprocessVersion: number;

  championship: Championship;
  frozenResult: ChampionshipResultData;

  // Estado atual (pós-correção) para recomputar o desfecho.
  teams: Team[];
  players: Player[];
  matches: MatchModel[];
  events: MatchEvent[];
  roundAwards: RoundAward[];

  // Documentos derivados existentes.
  /** player_history DESTE campeonato (para diff e para localizar o doc a atualizar). */
  frozenHistory: PlayerHistoryEntry[];
  /** Achievements de fim de campeonato concedidos e ATIVOS (não revogados) neste campeonato. */
  frozenAchievements: Achievement[];
  /** player_history GLOBAL (para recomputar career_stats dos afetados e rankings). */
  allPlayerHistory: PlayerHistoryEntry[];
  /** career_stats GLOBAL (para rebuild dos rankings). */
  allCareerStats: CareerStats[];
  /** championship_results GLOBAL (para o ranking de títulos por time). */
  allResults: ChampionshipResultData[];

  now: string;
  /** Se true, ausência de mudança lança `reprocess_no_effect` em vez de apenas registrar. */
  requireEffect?: boolean;
}

export interface ReprocessHistoryWrite {
  docId: string;
  isNew: boolean;
  data: PlayerHistoryEntry;
}

export interface ReprocessCareerWrite {
  userId: string;
  data: Omit<CareerStats, 'id'>;
}

export interface ReprocessRankingWrite {
  docId: (typeof ALL_TIME_RANKING_CATEGORIES)[number];
  data: { players: AllTimeRankingPlayer[] } | { teams: AllTimeRankingTeam[] };
}

export interface ReprocessAchievementGrant {
  playerId: string;
  achievementId: EndOfChampionshipAchievementId;
  data: Achievement;
}

export interface ReprocessAchievementRevoke {
  playerId: string;
  achievementId: string;
  update: Pick<Achievement, 'revoked' | 'revokedAt' | 'revokedBy' | 'revokedReason' | 'sourceReprocessId'>;
}

export interface ReprocessPlan {
  reprocessId: string;
  reprocessVersion: number;
  changed: boolean;
  previousResultsDigest: string;
  newResultsDigest: string;
  changedFields: string[];
  affectedUserIds: string[];
  resultUpdate: Partial<ChampionshipResultData>;
  historyWrites: ReprocessHistoryWrite[];
  careerStatsWrites: ReprocessCareerWrite[];
  rankingWrites: ReprocessRankingWrite[];
  achievementGrants: ReprocessAchievementGrant[];
  achievementRevocations: ReprocessAchievementRevoke[];
  log: ChampionshipReprocessLog;
}

export function reprocessIdFor(
  championshipId: string,
  sourceCorrectionId: string,
  newReprocessVersion: number,
): string {
  return `reprocess_${championshipId}_${sourceCorrectionId}_${newReprocessVersion}`;
}

export function historyIdFor(championshipId: string, userId: string): string {
  return `history_${championshipId}_${userId}`;
}

/**
 * Constrói, de forma pura e determinística, o plano completo de reprocessamento
 * de um campeonato encerrado a partir do estado atual (pós-correção). Valida as
 * pré-condições e lança `ReprocessError` tipado. Não escreve nada.
 */
export function buildReprocessPlan(input: ReprocessInput): ReprocessPlan {
  const {
    championship,
    frozenResult,
    reason,
    organizerId,
    sourceCorrectionId,
    sourceMatch,
    expectedReprocessVersion,
    teams,
    players,
    matches,
    events,
    roundAwards,
    frozenHistory,
    frozenAchievements,
    allPlayerHistory,
    allCareerStats,
    allResults,
    now,
  } = input;

  // 1. Validações estruturais.
  if (!championship) {
    throw new ReprocessError('championship_missing', 'Campeonato não encontrado para reprocessar.');
  }
  if (!reason || reason.trim().length < 5) {
    throw new ReprocessError(
      'reprocess_reason_required',
      'Informe um motivo com pelo menos 5 caracteres para reprocessar.',
    );
  }
  if (championship.organizerId !== organizerId) {
    throw new ReprocessError('not_owner', 'Somente o organizador dono do campeonato pode reprocessar.');
  }
  const isClosed = championship.status === 'finalizado' || !!frozenResult;
  if (!isClosed) {
    throw new ReprocessError(
      'championship_not_closed',
      'Só é possível reprocessar um campeonato encerrado.',
    );
  }
  if (!frozenResult) {
    throw new ReprocessError(
      'championship_results_missing',
      'Resultado congelado (championship_results) não encontrado.',
    );
  }
  if (!SUPPORTED_FORMATS.has(championship.format)) {
    throw new ReprocessError(
      'reprocess_unsupported_format',
      'Formato de campeonato não suportado pelo reprocessamento.',
    );
  }

  // 2. A partida corrigida precisa existir, pertencer ao campeonato e já ter a
  //    correção persistida (não reprocessar antes da correção).
  const persistedSource = matches.find((m) => m.id === sourceMatch.id);
  if (!persistedSource || persistedSource.championshipId !== championship.id) {
    throw new ReprocessError(
      'reprocess_source_match_not_found',
      'Partida corrigida não encontrada neste campeonato.',
    );
  }
  if (persistedSource.lastCorrectionId !== sourceCorrectionId) {
    throw new ReprocessError(
      'reprocess_correction_not_applied',
      'A correção ainda não foi aplicada nesta partida.',
    );
  }

  // 3. Grupo pós-transição permanece bloqueado (fora de escopo desta fase).
  const normalizedSource = normalizeMatchStage(persistedSource, championship);
  if (
    championship.format === 'grupos_e_mata_mata' &&
    normalizedSource.stage === 'group' &&
    hasGeneratedKnockout(championship)
  ) {
    throw new ReprocessError(
      'reprocess_group_stage_locked_after_knockout_generation',
      'Reprocessamento bloqueado: a fase de grupos foi congelada para gerar o mata-mata.',
    );
  }

  // 4. Recomputar desfecho (fonte única) e diferença contra o congelado.
  const recomputed = computeChampionshipOutcome({
    championship,
    teams,
    players,
    matches,
    events,
    roundAwards,
  });

  const frozenHistoryByUser: Record<string, ReprocessPlayerRow & { id?: string; finishedAt?: string }> = {};
  const frozenHistoryDocByUser: Record<string, PlayerHistoryEntry> = {};
  for (const h of frozenHistory) {
    frozenHistoryDocByUser[h.userId] = h;
    frozenHistoryByUser[h.userId] = {
      playerId: '',
      userId: h.userId,
      championshipId: h.championshipId,
      championshipName: h.championshipName,
      teamId: h.teamId,
      teamName: h.teamName,
      season: h.season,
      position: h.position,
      goals: h.goals,
      assists: h.assists,
      yellowCards: h.yellowCards,
      redCards: h.redCards,
      matchesPlayed: h.matchesPlayed,
      overall: h.overall,
      isChampion: h.isChampion,
      isMvp: h.isMvp,
      roundMvpCount: h.roundMvpCount,
      id: h.id,
      finishedAt: h.finishedAt,
    };
  }

  const frozenAchievementRefs: ExpectedAchievement[] = frozenAchievements
    .filter((a) => !a.revoked)
    .filter((a) =>
      (END_OF_CHAMPIONSHIP_ACHIEVEMENTS as readonly string[]).includes(a.achievementId),
    )
    .map((a) => ({
      playerId: a.playerId,
      achievementId: a.achievementId as EndOfChampionshipAchievementId,
    }));

  const diff = diffChampionshipOutcome({
    frozenResult,
    frozenHistoryByUser,
    frozenAchievements: frozenAchievementRefs,
    recomputed,
  });

  const previousResultsDigest = digestOutcomeResult(frozenResult);
  const newResultsDigest = digestOutcomeResult(recomputed.result);

  if (!diff.hasChanges && input.requireEffect) {
    throw new ReprocessError(
      'reprocess_no_effect',
      'Reprocessamento não produz nenhuma mudança de resultado.',
    );
  }

  const newReprocessVersion = expectedReprocessVersion + 1;
  const reprocessId = reprocessIdFor(championship.id, sourceCorrectionId, newReprocessVersion);
  const affectedUserIds = diff.historyDeltas.map((d) => d.userId);
  const affectedUserSet = new Set(affectedUserIds);

  // 5. championship_results: metadados sempre; campos competitivos só quando muda.
  const resultUpdate: Partial<ChampionshipResultData> = {
    reprocessVersion: newReprocessVersion,
    lastReprocessedBy: organizerId,
    lastReprocessedAt: now,
    sourceCorrectionId,
  };
  if (diff.hasChanges) {
    Object.assign(resultUpdate, recomputed.result, {
      reprocessVersion: newReprocessVersion,
      lastReprocessedBy: organizerId,
      lastReprocessedAt: now,
      sourceCorrectionId,
    });
  }

  // 6. player_history: atualiza o doc existente do campeonato (ou cria determinístico).
  const historyWrites: ReprocessHistoryWrite[] = [];
  const newRowByUser = new Map(recomputed.playerRows.map((r) => [r.userId, r]));
  if (diff.hasChanges) {
    for (const delta of diff.historyDeltas) {
      const row = newRowByUser.get(delta.userId);
      if (!row) continue;
      const existing = frozenHistoryDocByUser[delta.userId];
      const docId = existing?.id ?? historyIdFor(championship.id, delta.userId);
      historyWrites.push({
        docId,
        isNew: !existing,
        data: {
          id: docId,
          userId: row.userId,
          championshipId: championship.id,
          championshipName: row.championshipName,
          teamId: row.teamId,
          teamName: row.teamName,
          season: row.season,
          goals: row.goals,
          assists: row.assists,
          yellowCards: row.yellowCards,
          redCards: row.redCards,
          matchesPlayed: row.matchesPlayed,
          overall: row.overall,
          finishedAt: existing?.finishedAt ?? now,
          position: row.position,
          isChampion: row.isChampion,
          isMvp: row.isMvp,
          roundMvpCount: row.roundMvpCount,
        },
      });
    }
  }

  // 7. career_stats: só dos afetados, recomputado sobre o histórico GLOBAL com as
  //    linhas DESTE campeonato substituídas pelas recomputadas.
  const careerStatsWrites: ReprocessCareerWrite[] = [];
  if (diff.hasChanges) {
    const rowsThisChamp = recomputed.playerRows;
    for (const userId of affectedUserIds) {
      const row = newRowByUser.get(userId);
      const otherHistory = allPlayerHistory.filter(
        (h) => h.userId === userId && h.championshipId !== championship.id,
      );
      const thisChampRow = rowsThisChamp.find((r) => r.userId === userId);
      const historyForUser = [
        ...otherHistory,
        ...(thisChampRow
          ? [
              {
                goals: thisChampRow.goals,
                assists: thisChampRow.assists,
                matchesPlayed: thisChampRow.matchesPlayed,
                isChampion: thisChampRow.isChampion,
                roundMvpCount: thisChampRow.roundMvpCount,
                overall: thisChampRow.overall,
                season: thisChampRow.season,
              },
            ]
          : []),
      ];
      let totals: CareerStatsTotals | null;
      try {
        totals = computeCareerStatsTotals(historyForUser);
      } catch (err) {
        throw new ReprocessError(
          'career_stats_rebuild_failed',
          `Falha ao recalcular career_stats de ${userId}: ${err instanceof Error ? err.message : 'erro'}`,
        );
      }
      if (!totals) continue;
      const existingCareer = allCareerStats.find((c) => c.userId === userId);
      careerStatsWrites.push({
        userId,
        data: {
          userId,
          name:
            players.find((p) => p.userId === userId)?.name ?? existingCareer?.name ?? userId,
          lastTeamName: row?.teamName ?? existingCareer?.lastTeamName ?? '',
          ...totals,
          updatedAt: now,
        },
      });
    }
  }

  // 8. all_time_rankings: rebuild a partir do estado GLOBAL com afetados/resultado
  //    substituídos pelos recomputados.
  const rankingWrites: ReprocessRankingWrite[] = [];
  if (diff.hasChanges) {
    const careerByUser = new Map(allCareerStats.map((c) => [c.userId, c]));
    for (const w of careerStatsWrites) {
      careerByUser.set(w.userId, { ...(careerByUser.get(w.userId) ?? {}), id: w.userId, ...w.data });
    }
    const mergedCareer = [...careerByUser.values()];

    const resultsMerged = allResults.some((r) => r.championshipId === championship.id)
      ? allResults.map((r) =>
          r.championshipId === championship.id
            ? ({ ...r, ...recomputed.result } as ChampionshipResultData)
            : r,
        )
      : [...allResults, { ...frozenResult, ...recomputed.result } as ChampionshipResultData];

    const historyMerged = [
      ...allPlayerHistory.filter((h) => h.championshipId !== championship.id),
      ...recomputed.playerRows.map((row) => ({
        teamName: row.teamName,
        championshipId: championship.id,
      })),
    ];

    let docs: AllTimeRankingDocs;
    try {
      docs = buildAllTimeRankingDocs({
        careerStats: mergedCareer,
        results: resultsMerged,
        playerHistory: historyMerged,
      });
    } catch (err) {
      throw new ReprocessError(
        'rankings_rebuild_failed',
        `Falha ao reconstruir rankings: ${err instanceof Error ? err.message : 'erro'}`,
      );
    }
    rankingWrites.push(
      { docId: 'scorers', data: docs.scorers },
      { docId: 'titles', data: docs.titles },
      { docId: 'matches', data: docs.matches },
      { docId: 'mvps', data: docs.mvps },
      { docId: 'teams', data: docs.teams },
    );
  }

  // 9. Achievements: conceder o que passou a valer, revogar (soft) o que caiu.
  const achievementGrants: ReprocessAchievementGrant[] = diff.achievements.grant.map((a) => ({
    playerId: a.playerId,
    achievementId: a.achievementId,
    data: {
      achievementId: a.achievementId,
      playerId: a.playerId,
      championshipId: championship.id,
      unlockedAt: now,
      grantedAt: now,
      sourceReprocessId: reprocessId,
      revoked: false,
    },
  }));
  const achievementRevocations: ReprocessAchievementRevoke[] = diff.achievements.revoke.map((a) => ({
    playerId: a.playerId,
    achievementId: a.achievementId,
    update: {
      revoked: true,
      revokedAt: now,
      revokedBy: organizerId,
      revokedReason: reason.trim(),
      sourceReprocessId: reprocessId,
    },
  }));

  const rankingsAffected: string[] = diff.hasChanges ? [...ALL_TIME_RANKING_CATEGORIES] : [];
  const careerStatsAffected = careerStatsWrites.map((w) => w.userId);

  const grantRefs: ReprocessAchievementRef[] = achievementGrants.map((g) => ({
    playerId: g.playerId,
    achievementId: g.achievementId,
  }));
  const revokeRefs: ReprocessAchievementRef[] = achievementRevocations.map((r) => ({
    playerId: r.playerId,
    achievementId: r.achievementId,
  }));

  const log: ChampionshipReprocessLog = {
    id: reprocessId,
    reprocessId,
    championshipId: championship.id,
    sourceCorrectionId,
    sourceMatchId: sourceMatch.id,
    reason: reason.trim(),
    createdBy: organizerId,
    createdAt: now,
    previousResultsDigest,
    newResultsDigest,
    changed: diff.hasChanges,
    changedFields: diff.changedResultFields,
    affectedUserIds,
    historyDeltas: diff.historyDeltas.map((d) => ({
      userId: d.userId,
      before: (d.before as Record<string, unknown> | null) ?? null,
      after: d.after as unknown as Record<string, unknown>,
      changedFields: d.changedFields,
    })),
    achievementGrants: grantRefs,
    achievementRevocations: revokeRefs,
    careerStatsAffected,
    rankingsAffected,
    idempotencyKey: reprocessId,
    reprocessVersion: newReprocessVersion,
  };

  return {
    reprocessId,
    reprocessVersion: newReprocessVersion,
    changed: diff.hasChanges,
    previousResultsDigest,
    newResultsDigest,
    changedFields: diff.changedResultFields,
    affectedUserIds: [...affectedUserSet],
    resultUpdate,
    historyWrites,
    careerStatsWrites,
    rankingWrites,
    achievementGrants,
    achievementRevocations,
    log,
  };
}
