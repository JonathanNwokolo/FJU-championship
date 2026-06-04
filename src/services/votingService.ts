import { MatchEvent, MatchModel, Player, RoundVote, RoundAward } from '../types';
import { useVotingStore } from '../stores/votingStore';

// ---------------------------------------------------------------------------
// 1. getCandidatesForRound
// ---------------------------------------------------------------------------

export function getCandidatesForRound(
  championshipId: string,
  round: number,
  events: MatchEvent[],
  players: Player[],
  matches: MatchModel[],
): Player[] {
  const roundMatchIds = new Set(
    matches
      .filter((m) => m.championshipId === championshipId && m.round === round)
      .map((m) => m.id),
  );

  const scorerIds = new Set(
    events
      .filter((e) => e.type === 'gol' && roundMatchIds.has(e.matchId))
      .map((e) => e.playerId),
  );

  if (scorerIds.size > 0) {
    return players.filter((p) => scorerIds.has(p.id));
  }

  // Fallback: all players in the championship
  const champTeamIds = new Set(
    matches
      .filter((m) => m.championshipId === championshipId)
      .flatMap((m) => [m.homeTeamId, m.awayTeamId]),
  );
  return players.filter((p) => champTeamIds.has(p.teamId));
}

// ---------------------------------------------------------------------------
// 2. hasVoted
// ---------------------------------------------------------------------------

export async function hasVoted(
  championshipId: string,
  round: number,
  voterId: string,
): Promise<boolean> {
  const { votes } = useVotingStore.getState();
  return votes.some(
    (v) => v.championshipId === championshipId && v.round === round && v.voterId === voterId,
  );
}

// ---------------------------------------------------------------------------
// 3. submitVote
// ---------------------------------------------------------------------------

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function submitVote(
  championshipId: string,
  round: number,
  voterId: string,
  candidatePlayerId: string,
): Promise<void> {
  const alreadyVoted = await hasVoted(championshipId, round, voterId);
  if (alreadyVoted) {
    throw new Error('Você já votou nesta rodada');
  }

  const vote: RoundVote = {
    id: makeId(),
    championshipId,
    round,
    voterId,
    candidatePlayerId,
    createdAt: new Date().toISOString(),
  };

  useVotingStore.getState().addVote(vote);
}

// ---------------------------------------------------------------------------
// 4. getVoteResults
// ---------------------------------------------------------------------------

export async function getVoteResults(
  championshipId: string,
  round: number,
): Promise<{ playerId: string; votes: number }[]> {
  const { votes } = useVotingStore.getState();
  const roundVotes = votes.filter(
    (v) => v.championshipId === championshipId && v.round === round,
  );

  const tally: Record<string, number> = {};
  for (const v of roundVotes) {
    tally[v.candidatePlayerId] = (tally[v.candidatePlayerId] ?? 0) + 1;
  }

  return Object.entries(tally)
    .map(([playerId, votes]) => ({ playerId, votes }))
    .sort((a, b) => b.votes - a.votes);
}

// ---------------------------------------------------------------------------
// 5. isRoundComplete
// ---------------------------------------------------------------------------

export function isRoundComplete(matches: MatchModel[], round: number): boolean {
  const roundMatches = matches.filter((m) => m.round === round);
  if (roundMatches.length === 0) return false;
  return roundMatches.every((m) => m.status === 'finalizado');
}

// ---------------------------------------------------------------------------
// closeVoting — used by organizer to seal a round and create a RoundAward
// ---------------------------------------------------------------------------

export async function closeVoting(
  championshipId: string,
  round: number,
): Promise<RoundAward | null> {
  const results = await getVoteResults(championshipId, round);
  if (results.length === 0) return null;

  const winner = results[0];
  const { votes } = useVotingStore.getState();

  // We need player name and teamId — these are passed by the caller
  // Return data to let the caller enrich with player info before addAward
  return {
    id: makeId(),
    championshipId,
    round,
    winnerPlayerId: winner.playerId,
    winnerName: '', // filled by caller
    winnerTeamId: '', // filled by caller
    totalVotes: results.reduce((sum, r) => sum + r.votes, 0),
    closedAt: new Date().toISOString(),
  };
}
