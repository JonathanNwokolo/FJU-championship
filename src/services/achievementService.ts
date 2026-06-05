import { Achievement, MatchEvent, MatchModel, Player, RoundAward } from '../types';
import { useAchievementStore } from '../stores/achievementStore';

function buildAchievement(
  playerId: string,
  achievementId: string,
  championshipId: string,
  matchId?: string,
  round?: number,
): Achievement {
  return {
    achievementId,
    playerId,
    championshipId,
    unlockedAt: new Date().toISOString(),
    matchId,
    round,
  };
}

// ─── Core check function ───────────────────────────────────────────────────────
// Returns newly granted Achievement objects (not previously held).

export function checkAndGrantAchievements(
  playerId: string,
  championshipId: string,
  allEvents: MatchEvent[],
  allMatches: MatchModel[],
  allPlayers: Player[],
  roundAwards: RoundAward[],
): Achievement[] {
  const store = useAchievementStore.getState();
  const newAchievements: Achievement[] = [];

  const player = allPlayers.find((p) => p.id === playerId);
  if (!player) return [];

  const champEvents = allEvents.filter((e) => {
    const match = allMatches.find((m) => m.id === e.matchId);
    return match?.championshipId === championshipId;
  });

  const champMatches = allMatches.filter((m) => m.championshipId === championshipId);
  const finishedMatches = champMatches.filter((m) => m.status === 'finalizado');

  const playerGoalEvents = champEvents.filter(
    (e) => e.playerId === playerId && e.type === 'gol',
  );
  const totalGoals = playerGoalEvents.length;
  const teamId = player.teamId;

  function grant(achievementId: string, matchId?: string, round?: number) {
    if (store.hasAchievement(playerId, achievementId)) return;
    const a = buildAchievement(playerId, achievementId, championshipId, matchId, round);
    store.grantAchievement(a);
    newAchievements.push(a);
  }

  // ── hat_trick ──────────────────────────────────────────────────────────────
  const goalsByMatch: Record<string, number> = {};
  for (const e of playerGoalEvents) {
    goalsByMatch[e.matchId] = (goalsByMatch[e.matchId] ?? 0) + 1;
  }
  for (const [matchId, count] of Object.entries(goalsByMatch)) {
    if (count >= 3) {
      const match = champMatches.find((m) => m.id === matchId);
      grant('hat_trick', matchId, match?.round);
      break;
    }
  }

  // ── cinco_gols ─────────────────────────────────────────────────────────────
  if (totalGoals >= 5) {
    grant('cinco_gols');
  }

  // ── dez_gols ───────────────────────────────────────────────────────────────
  if (totalGoals >= 10) {
    grant('dez_gols');
  }

  // ── primeiro_gol ───────────────────────────────────────────────────────────
  if (totalGoals >= 1) {
    const anyOtherHasIt = allPlayers
      .filter((p) => p.id !== playerId)
      .some((p) => store.hasAchievement(p.id, 'primeiro_gol'));
    if (!anyOtherHasIt) {
      grant('primeiro_gol', playerGoalEvents[0]?.matchId);
    }
  }

  // ── artilheiro_rodada ──────────────────────────────────────────────────────
  // Find rounds that have at least one finished match involving this player's team
  const rounds = [...new Set(finishedMatches.map((m) => m.round))];
  for (const round of rounds) {
    const roundMatches = finishedMatches.filter((m) => m.round === round);
    const roundMatchIds = roundMatches.map((m) => m.id);
    const roundEvents = champEvents.filter(
      (e) => roundMatchIds.includes(e.matchId) && e.type === 'gol',
    );

    const goalsByPlayer: Record<string, number> = {};
    for (const e of roundEvents) {
      goalsByPlayer[e.playerId] = (goalsByPlayer[e.playerId] ?? 0) + 1;
    }

    const playerRoundGoals = goalsByPlayer[playerId] ?? 0;
    if (playerRoundGoals === 0) continue;

    const maxGoals = Math.max(...Object.values(goalsByPlayer));
    if (playerRoundGoals === maxGoals) {
      grant('artilheiro_rodada', undefined, round);
    }
  }

  // ── artilheiro_campeonato ──────────────────────────────────────────────────
  // Only if all championship matches are finished
  const allMatchesFinished =
    champMatches.length > 0 && champMatches.every((m) => m.status === 'finalizado');
  if (allMatchesFinished) {
    const goalsByPlayer: Record<string, number> = {};
    for (const e of champEvents.filter((e) => e.type === 'gol')) {
      goalsByPlayer[e.playerId] = (goalsByPlayer[e.playerId] ?? 0) + 1;
    }
    const maxGoals = Math.max(0, ...Object.values(goalsByPlayer));
    if (maxGoals > 0 && (goalsByPlayer[playerId] ?? 0) === maxGoals) {
      grant('artilheiro_campeonato');
    }
  }

  // ── gol_decisivo ───────────────────────────────────────────────────────────
  for (const [matchId, _] of Object.entries(goalsByMatch)) {
    const match = champMatches.find((m) => m.id === matchId);
    if (!match || match.status !== 'finalizado') continue;
    if (match.homeScore === null || match.awayScore === null) continue;

    const isHomeTeam = match.homeTeamId === teamId;
    const teamFinalScore = isHomeTeam ? match.homeScore : match.awayScore;
    const opponentFinalScore = isHomeTeam ? match.awayScore : match.homeScore;
    if (teamFinalScore <= opponentFinalScore) continue; // team didn't win

    const matchEvents = champEvents
      .filter((e) => e.matchId === matchId && e.type === 'gol')
      .sort((a, b) => a.minute - b.minute);

    // Replay score and find decisive goal
    let homeScore = 0;
    let awayScore = 0;
    for (const e of matchEvents) {
      const wasHome = e.teamId === match.homeTeamId;
      const teamScore = isHomeTeam ? homeScore : awayScore;
      const oppScore = isHomeTeam ? awayScore : homeScore;

      // This goal is decisive if before it the team was behind or tied
      if (e.playerId === playerId && teamScore <= oppScore) {
        grant('gol_decisivo', matchId, match.round);
        break;
      }

      if (wasHome) homeScore++;
      else awayScore++;
    }
  }

  // ── fair_play_rodada ───────────────────────────────────────────────────────
  for (const round of rounds) {
    const roundMatches = finishedMatches.filter((m) => m.round === round);
    const teamPlayedInRound = roundMatches.some(
      (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
    );
    if (!teamPlayedInRound) continue;

    const roundMatchIds = roundMatches.map((m) => m.id);
    const hasCard = champEvents.some(
      (e) =>
        roundMatchIds.includes(e.matchId) &&
        e.playerId === playerId &&
        (e.type === 'cartao_amarelo' || e.type === 'cartao_vermelho'),
    );
    if (!hasCard) {
      grant('fair_play_rodada', undefined, round);
      break; // grant once
    }
  }

  // ── fair_play_campeonato ───────────────────────────────────────────────────
  if (allMatchesFinished) {
    const hasAnyCard = champEvents.some(
      (e) =>
        e.playerId === playerId &&
        (e.type === 'cartao_amarelo' || e.type === 'cartao_vermelho'),
    );
    if (!hasAnyCard) {
      grant('fair_play_campeonato');
    }
  }

  // ── clean_sheet / tres_clean_sheets ───────────────────────────────────────
  if (player.position === 'goleiro') {
    const teamMatches = finishedMatches.filter(
      (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
    );
    let cleanSheetCount = 0;

    for (const match of teamMatches) {
      const opponentTeamId =
        match.homeTeamId === teamId ? match.awayTeamId : match.homeTeamId;
      const opponentGoals = champEvents.filter(
        (e) => e.matchId === match.id && e.teamId === opponentTeamId && e.type === 'gol',
      ).length;
      if (opponentGoals === 0) {
        cleanSheetCount++;
        grant('clean_sheet', match.id, match.round);
      }
    }

    if (cleanSheetCount >= 3) {
      grant('tres_clean_sheets');
    }
  }

  // ── invicto_rodada ─────────────────────────────────────────────────────────
  for (const round of rounds) {
    const roundMatches = finishedMatches.filter((m) => m.round === round);
    const teamRoundMatches = roundMatches.filter(
      (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
    );
    if (teamRoundMatches.length === 0) continue;

    const didLose = teamRoundMatches.some((m) => {
      if (m.homeScore === null || m.awayScore === null) return false;
      const isHome = m.homeTeamId === teamId;
      return isHome ? m.homeScore < m.awayScore : m.awayScore < m.homeScore;
    });

    if (!didLose) {
      grant('invicto_rodada', undefined, round);
      break;
    }
  }

  // ── virada ─────────────────────────────────────────────────────────────────
  const teamMatches = finishedMatches.filter(
    (m) => m.homeTeamId === teamId || m.awayTeamId === teamId,
  );
  for (const match of teamMatches) {
    if (match.homeScore === null || match.awayScore === null) continue;
    const isHome = match.homeTeamId === teamId;
    const teamFinal = isHome ? match.homeScore : match.awayScore;
    const oppFinal = isHome ? match.awayScore : match.homeScore;
    if (teamFinal <= oppFinal) continue; // team must have won

    const matchEvents = champEvents
      .filter((e) => e.matchId === match.id && e.type === 'gol')
      .sort((a, b) => a.minute - b.minute);

    // Check if team was losing at any point in the first half
    let homeScore = 0;
    let awayScore = 0;
    let wasLosingAtHalf = false;

    for (const e of matchEvents) {
      if (e.minute > 45) break;
      if (e.teamId === match.homeTeamId) homeScore++;
      else awayScore++;
    }
    const teamHalf = isHome ? homeScore : awayScore;
    const oppHalf = isHome ? awayScore : homeScore;
    wasLosingAtHalf = teamHalf < oppHalf;

    if (wasLosingAtHalf) {
      grant('virada', match.id, match.round);
    }
  }

  // ── craque_rodada ──────────────────────────────────────────────────────────
  for (const award of roundAwards) {
    if (award.championshipId === championshipId && award.winnerPlayerId === playerId) {
      grant('craque_rodada', undefined, award.round);
    }
  }

  // ── participacao ───────────────────────────────────────────────────────────
  const matchesWithPlayer = finishedMatches.filter((m) => {
    const inMatch =
      m.homeTeamId === teamId || m.awayTeamId === teamId;
    return inMatch;
  }).length;

  if (matchesWithPlayer >= 5) {
    grant('participacao');
  }

  return newAchievements;
}
