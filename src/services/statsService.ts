import {
  MatchModel,
  MatchEvent,
  Team,
  Player,
  ChampionshipRules,
  TeamStanding,
  PlayerScorer,
  PlayerDisciplineRanking,
  SuspendedPlayer,
} from '../types';
import { activeMatchEvents } from '../utils/matchRules';

// ─── Standings ────────────────────────────────────────────────────────────────

// Goals for a given team in a finished match come from the match document
// (homeScore/awayScore) — the single source of truth. Goal events are used
// ONLY for individual top-scorer stats, never for V/E/D/points/saldo.
function goalsForTeamInMatch(m: MatchModel, teamId: string): number {
  if (teamId === m.homeTeamId) return m.homeScore ?? 0;
  if (teamId === m.awayTeamId) return m.awayScore ?? 0;
  return 0;
}

// P-13: ordena um grupo de times empatados em PONTOS, aplicando os critérios de
// desempate na ordem configurada. O `confronto_direto` é resolvido por uma
// MINI-TABELA calculada só com as partidas ENTRE os membros do grupo (pontos →
// saldo → gols pró no recorte) — o correto quando 3+ times empatam. A comparação
// par-a-par anterior podia produzir ordem inconsistente (A>B, B>C, C>A).
function sortTiedGroup(
  group: TeamStanding[],
  finishedMatches: MatchModel[],
  rules: ChampionshipRules,
): TeamStanding[] {
  const groupIds = new Set(group.map((g) => g.teamId));
  const h2h: Record<string, { points: number; gd: number; gf: number }> = {};
  for (const g of group) h2h[g.teamId] = { points: 0, gd: 0, gf: 0 };

  for (const m of finishedMatches) {
    if (!groupIds.has(m.homeTeamId) || !groupIds.has(m.awayTeamId)) continue;
    const hg = goalsForTeamInMatch(m, m.homeTeamId);
    const ag = goalsForTeamInMatch(m, m.awayTeamId);
    const home = h2h[m.homeTeamId];
    const away = h2h[m.awayTeamId];
    home.gf += hg;
    away.gf += ag;
    home.gd += hg - ag;
    away.gd += ag - hg;
    if (hg > ag) home.points += rules.pointsWin;
    else if (hg < ag) away.points += rules.pointsWin;
    else {
      home.points += rules.pointsDraw;
      away.points += rules.pointsDraw;
    }
  }

  return [...group].sort((a, b) => {
    for (const tb of rules.tiebreakers) {
      if (tb === 'saldo_gols' && b.goalDifference !== a.goalDifference)
        return b.goalDifference - a.goalDifference;

      if (tb === 'gols_pro' && b.goalsFor !== a.goalsFor)
        return b.goalsFor - a.goalsFor;

      if (tb === 'confronto_direto') {
        const ha = h2h[a.teamId];
        const hb = h2h[b.teamId];
        if (hb.points !== ha.points) return hb.points - ha.points;
        if (hb.gd !== ha.gd) return hb.gd - ha.gd;
        if (hb.gf !== ha.gf) return hb.gf - ha.gf;
      }

      if (tb === 'fair_play' && a.fairPlayScore !== b.fairPlayScore)
        return a.fairPlayScore - b.fairPlayScore;
    }
    return 0;
  });
}

export function calculateStandings(
  matches: MatchModel[],
  events: MatchEvent[],
  teams: Team[],
  rules: ChampionshipRules,
): TeamStanding[] {
  const activeEvents = activeMatchEvents(events);
  const approvedTeams = teams.filter((team) => team.status == null || team.status === 'aprovado');
  const finishedMatches = matches.filter((m) => m.status === 'finalizado');
  const finishedMatchIds = new Set(finishedMatches.map((m) => m.id));

  const map: Record<string, TeamStanding> = {};
  for (const t of approvedTeams) {
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

  for (const e of activeEvents) {
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

  // Ordena por pontos e, para cada bloco de empatados, resolve o desempate em
  // grupo (mini-tabela de confronto direto). Ver sortTiedGroup (P-13).
  list.sort((a, b) => b.points - a.points);

  const ordered: TeamStanding[] = [];
  let i = 0;
  while (i < list.length) {
    let j = i;
    while (j < list.length && list[j].points === list[i].points) j += 1;
    const group = list.slice(i, j);
    if (group.length > 1) {
      ordered.push(...sortTiedGroup(group, finishedMatches, rules));
    } else {
      ordered.push(...group);
    }
    i = j;
  }

  return ordered;
}

// ─── Top scorers ──────────────────────────────────────────────────────────────

export function calculateTopScorers(
  events: MatchEvent[],
  players: Player[],
  teams: Team[],
): PlayerScorer[] {
  const activeEvents = activeMatchEvents(events);
  // AUD-04: a artilharia é dirigida pelos EVENTOS (não pela existência do player).
  // Acumula gols por playerId e guarda um snapshot de nome/time vindo do próprio
  // evento, usado como fallback quando o documento do player/team não existe mais
  // (ex.: atleta removido). IMPORTANTE: `events` deve já vir filtrado pelo campeonato.
  const goalMap: Record<
    string,
    { goals: number; snapName?: string; snapTeamId?: string; snapTeamName?: string }
  > = {};
  for (const e of activeEvents) {
    if (e.type !== 'gol') continue;
    const cur = goalMap[e.playerId] ?? { goals: 0 };
    cur.goals += 1;
    if (!cur.snapName && e.playerName) cur.snapName = e.playerName;
    if (!cur.snapTeamId && e.teamId) cur.snapTeamId = e.teamId;
    if (!cur.snapTeamName && e.teamName) cur.snapTeamName = e.teamName;
    goalMap[e.playerId] = cur;
  }

  const scorers: PlayerScorer[] = [];
  for (const [playerId, info] of Object.entries(goalMap)) {
    const player = players.find((p) => p.id === playerId);
    const teamId = player?.teamId ?? info.snapTeamId ?? '';
    const team = teams.find((t) => t.id === teamId);
    scorers.push({
      playerId,
      playerName: player?.name ?? info.snapName ?? 'Jogador',
      teamId,
      teamName: team?.name ?? info.snapTeamName ?? '',
      teamColor: team?.primaryColor ?? '#888',
      goals: info.goals,
    });
  }

  return scorers.sort((a, b) => b.goals - a.goals);
}

export function calculatePlayerDisciplineRanking(
  events: MatchEvent[],
  players: Player[],
  teams: Team[],
): PlayerDisciplineRanking[] {
  const activeEvents = activeMatchEvents(events);
  // AUD-04: ranking de cartões dirigido pelos EVENTOS, com snapshot de nome/time
  // como fallback quando o documento do player não existe mais (atleta removido).
  // `events` deve já vir filtrado pelo campeonato.
  const cardMap: Record<
    string,
    { yellowCards: number; redCards: number; teamId: string; snapName?: string; snapTeamName?: string }
  > = {};

  for (const event of activeEvents) {
    if (event.type !== 'cartao_amarelo' && event.type !== 'cartao_vermelho') continue;

    const current = cardMap[event.playerId] ?? {
      yellowCards: 0,
      redCards: 0,
      teamId: event.teamId,
    };

    if (event.type === 'cartao_amarelo') current.yellowCards += 1;
    if (event.type === 'cartao_vermelho') current.redCards += 1;
    current.teamId = current.teamId || event.teamId;
    if (!current.snapName && event.playerName) current.snapName = event.playerName;
    if (!current.snapTeamName && event.teamName) current.snapTeamName = event.teamName;
    cardMap[event.playerId] = current;
  }

  const ranking: PlayerDisciplineRanking[] = [];

  for (const [playerId, cards] of Object.entries(cardMap)) {
    if (cards.yellowCards + cards.redCards === 0) continue;

    const player = players.find((item) => item.id === playerId);
    const teamId = cards.teamId || player?.teamId || '';
    const team = teams.find((item) => item.id === teamId);

    ranking.push({
      playerId,
      playerName: player?.name ?? cards.snapName ?? 'Jogador',
      teamId,
      teamName: team?.name ?? cards.snapTeamName ?? '',
      teamColor: team?.primaryColor ?? '#888',
      yellowCards: cards.yellowCards,
      redCards: cards.redCards,
    });
  }

  return ranking.sort((a, b) => {
    if (b.redCards !== a.redCards) return b.redCards - a.redCards;
    if (b.yellowCards !== a.yellowCards) return b.yellowCards - a.yellowCards;
    return a.playerName.localeCompare(b.playerName);
  });
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
  const activeEvents = activeMatchEvents(events);
  const byId = new Map(finishedMatches.map((m) => [m.id, m]));
  const cards = collectPlayerCards(activeEvents, byId, playerId);
  return buildSuspensionMap(cards, yellowLimit).get(targetRound) ?? null;
}

export function getSuspendedPlayers(
  matches: MatchModel[],
  events: MatchEvent[],
  players: Player[],
  teams: Team[],
  rules: ChampionshipRules,
): SuspendedPlayer[] {
  const activeEvents = activeMatchEvents(events);
  const finishedMatches = matches.filter((m) => m.status === 'finalizado');
  if (!finishedMatches.length) return [];

  const lastRound = Math.max(...finishedMatches.map((m) => m.round));
  const nextRound = lastRound + 1;
  const limit = rules.yellowCardLimit ?? 3;
  const finishedMatchById = new Map(finishedMatches.map((m) => [m.id, m]));

  const result: SuspendedPlayer[] = [];

  for (const player of players) {
    const cards = collectPlayerCards(activeEvents, finishedMatchById, player.id);
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
