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

export function calculateStandings(
  matches: MatchModel[],
  events: MatchEvent[],
  teams: Team[],
  rules: ChampionshipRules,
): TeamStanding[] {
  const finishedMatches = matches.filter((m) => m.status === 'finalizado');
  const finishedMatchIds = new Set(finishedMatches.map((m) => m.id));

  // Goals keyed by matchId → teamId → count (uses events, not homeScore/awayScore)
  const goalsByMatch: Record<string, Record<string, number>> = {};
  for (const e of events) {
    if (e.type !== 'gol' || !finishedMatchIds.has(e.matchId)) continue;
    if (!goalsByMatch[e.matchId]) goalsByMatch[e.matchId] = {};
    goalsByMatch[e.matchId][e.teamId] = (goalsByMatch[e.matchId][e.teamId] ?? 0) + 1;
  }

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

    const hg = goalsByMatch[m.id]?.[m.homeTeamId] ?? 0;
    const ag = goalsByMatch[m.id]?.[m.awayTeamId] ?? 0;

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
          const ag2 = goalsByMatch[m.id]?.[a.teamId] ?? 0;
          const bg2 = goalsByMatch[m.id]?.[b.teamId] ?? 0;
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
  const lastRoundMatchIds = new Set(
    finishedMatches.filter((m) => m.round === lastRound).map((m) => m.id),
  );

  const redInLastRound = new Set(
    events
      .filter((e) => e.type === 'cartao_vermelho' && lastRoundMatchIds.has(e.matchId))
      .map((e) => e.playerId),
  );

  const limit = rules.yellowCardLimit ?? 3;
  const yellowCount: Record<string, number> = {};
  for (const e of events) {
    if (e.type === 'cartao_amarelo') {
      yellowCount[e.playerId] = (yellowCount[e.playerId] ?? 0) + 1;
    }
  }

  const result: SuspendedPlayer[] = [];
  const added = new Set<string>();

  for (const player of players) {
    if (added.has(player.id)) continue;
    const team = teams.find((t) => t.id === player.teamId);
    const teamName = team?.name ?? '';

    if (redInLastRound.has(player.id)) {
      result.push({
        playerId: player.id,
        playerName: player.name,
        teamId: player.teamId ?? '',
        teamName,
        reason: 'cartao_vermelho',
      });
      added.add(player.id);
    } else if ((yellowCount[player.id] ?? 0) >= limit) {
      result.push({
        playerId: player.id,
        playerName: player.name,
        teamId: player.teamId ?? '',
        teamName,
        reason: 'amarelos_acumulados',
      });
      added.add(player.id);
    }
  }

  return result;
}
