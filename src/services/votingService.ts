import { MatchEvent, MatchModel, Player, RoundVote, RoundAward } from '../types';
import { useVotingStore } from '../stores/votingStore';
import { upsertDocument, getCollection } from './firestore';

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
  return players.filter((p) => p.teamId != null && champTeamIds.has(p.teamId));
}

// ---------------------------------------------------------------------------
// 2. hasVoted — verifica no Firestore (fonte de verdade)
// ---------------------------------------------------------------------------

export async function hasVoted(
  championshipId: string,
  round: number,
  voterId: string,
): Promise<boolean> {
  // Verifica primeiro no cache local para resposta rápida
  const localVotes = useVotingStore.getState().votes;
  const inLocal = localVotes.some(
    (v) => v.championshipId === championshipId && v.round === round && v.voterId === voterId,
  );
  if (inLocal) return true;

  // Confirma no Firestore (evita duplo voto cross-device)
  const firestoreVotes = await getCollection<RoundVote>('round_votes', [
    { field: 'championshipId', operator: '==', value: championshipId },
    { field: 'round', operator: '==', value: round },
    { field: 'voterId', operator: '==', value: voterId },
  ]);
  return firestoreVotes.length > 0;
}

// ---------------------------------------------------------------------------
// 3. submitVote — grava no Firestore E no store local
// ---------------------------------------------------------------------------

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

  // ID determinístico previne voto duplo em race condition cross-device
  const docId = `${championshipId}_${round}_${voterId}`;
  const voteData = {
    championshipId,
    round,
    voterId,
    candidatePlayerId,
    createdAt: new Date().toISOString(),
  };

  const vote: RoundVote = { id: docId, ...voteData };

  // Persiste no Firestore como fonte de verdade
  await upsertDocument('round_votes', docId, voteData);

  // Atualiza cache local
  useVotingStore.getState().addVote(vote);
}

// ---------------------------------------------------------------------------
// 4. getVoteResults — lê do Firestore para resultado definitivo
// ---------------------------------------------------------------------------

export async function getVoteResults(
  championshipId: string,
  round: number,
): Promise<{ playerId: string; votes: number }[]> {
  const tally: Record<string, number> = {};

  const firestoreVotes = await getCollection<RoundVote>('round_votes', [
    { field: 'championshipId', operator: '==', value: championshipId },
    { field: 'round', operator: '==', value: round },
  ]);

  for (const v of firestoreVotes) {
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
// closeVoting — cria RoundAward com dados completos
// ---------------------------------------------------------------------------

export async function closeVoting(
  championshipId: string,
  round: number,
  players: Player[],
): Promise<RoundAward | null> {
  const results = await getVoteResults(championshipId, round);
  if (results.length === 0) return null;

  const winner = results[0];
  const winnerPlayer = players.find((p) => p.id === winner.playerId);

  return {
    id: '',  // será preenchido pelo caller após addDocument
    championshipId,
    round,
    winnerPlayerId: winner.playerId,
    winnerName: winnerPlayer?.name ?? '',
    winnerTeamId: winnerPlayer?.teamId ?? '',
    totalVotes: results.reduce((sum, r) => sum + r.votes, 0),
    closedAt: new Date().toISOString(),
  };
}
