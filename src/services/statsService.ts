import {
  MatchModel,
  MatchEvent,
  Team,
  Player,
  ChampionshipRules,
  TeamStanding,
  PlayerScorer,
  SuspendedPlayer,
} from '../types';

// ─── Standings ────────────────────────────────────────────────────────────────

// Goals for a given team in a finished match come from the match document
// (homeScore/awayScore) — the single source of truth. Goal events are used
// ONLY for individual top-scorer stats, never for V/E/D/points/saldo.
function goalsForTeamInMatch(m: MatchModel, teamId: string): number {
  if (teamId === m.homeTeamId) return m.homeScore ?? 0;
  if (teamId === m.awayTeamId) return m.awayScore ?? 0;
  return 0;
}

export function calculateStandings(
  matches: MatchModel[],
  events: MatchEvent[],
  teams: Team[],
  rules: ChampionshipRules,
): TeamStanding[] {
  const finishedMatches = matches.filter((m) => m.status === 'finalizado');
  const finishedMatchIds = new Set(finishedMatches.map((m) => m.id));

  const map: Record<string, TeamStanding> = {};
  for (const t of teams) {
    map[t.id] = {
      teamId: t.id,
      teamName: t.name,
      primaryColor: t.primaryColor,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      yellowCards: 0,
      redCards: 0,
      fairPlayScore: 0,
    };
  }

  for (const m of finishedMatches) {
    const home = map[m.homeTeamId];
    const away = map[m.awayTeamId];
    if (!home || !away) continue;

    const hg = m.homeScore ?? 0;
    const ag = m.awayScore ?? 0;

    home.played++;
    away.played++;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;

    if (hg > ag) {
      home.won++;
      home.points += rules.pointsWin;
      away.lost++;
      away.points += rules.pointsLoss;
    } else if (hg < ag) {
      away.won++;
      away.points += rules.pointsWin;
      home.lost++;
      home.points += rules.pointsLoss;
    } else {
      home.drawn++;
      home.points += rules.pointsDraw;
      away.drawn++;
      away.points += rules.pointsDraw;
    }
  }

  for (const e of events) {
    if (!finishedMatchIds.has(e.matchId)) continue;
    const s = map[e.teamId];
    if (!s) continue;
    if (e.type === 'cartao_amarelo') s.yellowCards++;
    if (e.type === 'cartao_vermelho') s.redCards++;
  }

  for (const s of Object.values(map)) {
    s.goalDifference = s.goalsFor - s.goalsAgainst;
    s.fairPlayScore = s.yellowCards + s.redCards * 3;
  }

  const list = Object.values(map);

  list.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    for (const tb of rules.tiebreakers) {
      if (tb === 'saldo_gols' && b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;

      if (tb === 'gols_pro' && b.goalsFor !== a.goalsFor)
        return b.goalsFor - a.goalsFor;

      if (tb === 'confronto_direto') {
        const h2h = finishedMatches.filter(
          (m) =>
            (m.homeTeamId === a.teamId && m.awayTeamId === b.teamId) ||
            (m.homeTeamId === b.teamId && m.awayTeamId === a.teamId),
        );
        let ap = 0;
        let bp = 0;
        for (const m of h2h) {
          const ag2 = goalsForTeamInMatch(m, a.teamId);
          const bg2 = goalsForTeamInMatch(m, b.teamId);
          if (ag2 > bg2) ap += rules.pointsWin;
          else if (ag2 < bg2) bp += rules.pointsWin;
          else { ap += rules.pointsDraw; bp += rules.pointsDraw; }
        }
        if (bp !== ap) return bp - ap;
      }

      if (tb === 'fair_play' && a.fairPlayScore !== b.fairPlayScore)
        return a.fairPlayScore - b.fairPlayScore;
    }
    return 0;
  });

  return list;
}

// ─── Top scorers ──────────────────────────────────────────────────────────────

export function calculateTopScorers(
  events: MatchEvent[],
  players: Player[],
  teams: Team[],
): PlayerScorer[] {
  const goalMap: Record<string, number> = {};
  for (const e of events) {
    if (e.type !== 'gol') continue;
    goalMap[e.playerId] = (goalMap[e.playerId] ?? 0) + 1;
  }

  const scorers: PlayerScorer[] = [];
  for (const [playerId, goals] of Object.entries(goalMap)) {
    const player = players.find((p) => p.id === playerId);
    if (!player) continue;
    const team = teams.find((t) => t.id === player.teamId);
    scorers.push({
      playerId,
      playerName: player.name,
      teamId: player.teamId ?? '',
      teamName: team?.name ?? '',
      teamColor: team?.primaryColor ?? '#888',
      goals,
    });
  }

  return scorers.sort((a, b) => b.goals - a.goals);
}

// ─── Highlights ───────────────────────────────────────────────────────────────

export function calculateBestAttack(standings: TeamStanding[]): TeamStanding | null {
  if (!standings.length) return null;
  return standings.reduce((best, s) => (s.goalsFor > best.goalsFor ? s : best));
}

export function calculateBestDefense(standings: TeamStanding[]): TeamStanding | null {
  if (!standings.length) return null;
  return standings.reduce((best, s) => (s.goalsAgainst < best.goalsAgainst ? s : best));
}

export function calculateRoundMVP(
  matches: MatchModel[],
  events: MatchEvent[],
  teams: Team[],
  round: number,
  rules: ChampionshipRules,
): TeamStanding | null {
  const roundMatches = matches.filter((m) => m.round === round);
  const standings = calculateStandings(roundMatches, events, teams, rules);
  return standings[0] ?? null;
}

// ─── Suspensions ──────────────────────────────────────────────────────────────

type SuspensionReason = 'cartao_vermelho' | 'amarelos_acumulados';

interface PlayerCard {
  round: number;
  type: 'cartao_amarelo' | 'cartao_vermelho';
}

function collectPlayerCards(
  events: MatchEvent[],
  finishedMatchById: Map<string, MatchModel>,
  playerId: string,
): PlayerCard[] {
  const cards: PlayerCard[] = [];
  for (const e of events) {
    if (e.playerId !== playerId) continue;
    if (e.type !== 'cartao_amarelo' && e.type !== 'cartao_vermelho') continue;
    const match = finishedMatchById.get(e.matchId);
    if (!match) continue;
    cards.push({ round: match.round, type: e.type });
  }
  return cards;
}

/**
 * Simulates the discipline cycle and returns, per round, why the player is
 * suspended in it:
 *  - Yellows accumulate across rounds. As soon as they reach the limit the
 *    player is suspended the FOLLOWING round and the counter resets to zero,
 *    so the cycle starts over.
 *  - A red card suspends the FOLLOWING round directly (and takes precedence
 *    over an accumulated-yellows suspension on the same round).
 */
function buildSuspensionMap(
  cards: PlayerCard[],
  yellowLimit: number,
): Map<number, SuspensionReason> {
  const ordered = [...cards].sort((a, b) => a.round - b.round);
  const map = new Map<number, SuspensionReason>();
  let yellowAcc = 0;

  for (const card of ordered) {
    if (card.type === 'cartao_vermelho') {
      map.set(card.round + 1, 'cartao_vermelho');
    } else {
      yellowAcc += 1;
      if (yellowAcc >= yellowLimit) {
        if (!map.has(card.round + 1)) map.set(card.round + 1, 'amarelos_acumulados');
        yellowAcc = 0; // reset the cycle once a suspension is triggered
      }
    }
  }

  return map;
}

/**
 * Whether a player is suspended for a specific round, applying the cycle above
 * to cards earned in earlier finished rounds. Returns the reason or null.
 * Shared by the suspensions list and by match registration.
 */
export function getPlayerSuspensionReason(
  events: MatchEvent[],
  finishedMatches: MatchModel[],
  playerId: string,
  targetRound: number,
  yellowLimit: number,
): SuspensionReason | null {
  const byId = new Map(finishedMatches.map((m) => [m.id, m]));
  const cards = collectPlayerCards(events, byId, playerId);
  return buildSuspensionMap(cards, yellowLimit).get(targetRound) ?? null;
}

export function getSuspendedPlayers(
  matches: MatchModel[],
  events: MatchEvent[],
  players: Player[],
  teams: Team[],
  rules: ChampionshipRules,
): SuspendedPlayer[] {
  const finishedMatches = matches.filter((m) => m.status === 'finalizado');
  if (!finishedMatches.length) return [];

  const lastRound = Math.max(...finishedMatches.map((m) => m.round));
  const nextRound = lastRound + 1;
  const limit = rules.yellowCardLimit ?? 3;
  const finishedMatchById = new Map(finishedMatches.map((m) => [m.id, m]));

  const result: SuspendedPlayer[] = [];

  for (const player of players) {
    const cards = collectPlayerCards(events, finishedMatchById, player.id);
    if (cards.length === 0) continue;

    const reason = buildSuspensionMap(cards, limit).get(nextRound);
    if (!reason) continue;

    const team = teams.find((t) => t.id === player.teamId);
    result.push({
      playerId: player.id,
      playerName: player.name,
      teamId: player.teamId ?? '',
      teamName: team?.name ?? '',
      reason,
    });
  }

  return result;
}
