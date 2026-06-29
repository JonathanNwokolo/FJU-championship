import { MatchEvent, MatchModel, Player, RoundVote, RoundAward } from '../types';
import { useVotingStore } from '../stores/votingStore';
import { upsertDocument, setDocument, getCollection, getDocument } from './firestore';
import { auth } from './firebase';
import { isActiveRosterPlayer } from '../utils/teamRules';
import { MOCK_DATA_ENABLED as USE_MOCK } from '../config/appConfig';

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

  // Candidatos de votação NOVA são sempre do elenco atual — quem saiu
  // ('sem_time') ou foi removido mantém o teamId antigo no doc e não concorre.
  if (scorerIds.size > 0) {
    return players.filter((p) => scorerIds.has(p.id) && isActiveRosterPlayer(p));
  }

  // Fallback: all active players in the championship
  const champTeamIds = new Set(
    matches
      .filter((m) => m.championshipId === championshipId)
      .flatMap((m) => [m.homeTeamId, m.awayTeamId]),
  );
  return players.filter(
    (p) => p.teamId != null && champTeamIds.has(p.teamId) && isActiveRosterPlayer(p),
  );
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
  // AUD-07: revalida TODAS as regras no service (o cliente não é confiável).

  // 0. Autenticação: o voto precisa ser do próprio usuário autenticado.
  if (!USE_MOCK && (!auth.currentUser || auth.currentUser.uid !== voterId)) {
    throw new Error('Você precisa estar autenticado para votar.');
  }

  // 1. A rodada precisa existir e estar com a votação ABERTA:
  //    - todas as partidas da rodada finalizadas, e
  //    - votação ainda não encerrada (sem RoundAward para a rodada).
  const champMatches = await getCollection<MatchModel>('matches', [
    { field: 'championshipId', operator: '==', value: championshipId },
  ]);
  const roundMatches = champMatches.filter((m) => m.round === round);
  if (roundMatches.length === 0 || !roundMatches.every((m) => m.status === 'finalizado')) {
    throw new Error('A votação desta rodada ainda não está disponível.');
  }

  const existingAwards = await getCollection<RoundAward>('round_awards', [
    { field: 'championshipId', operator: '==', value: championshipId },
    { field: 'round', operator: '==', value: round },
  ]);
  if (existingAwards.length > 0) {
    throw new Error('A votação desta rodada já foi encerrada.');
  }

  // 2. O usuário ainda não pode ter votado nesta rodada.
  const alreadyVoted = await hasVoted(championshipId, round, voterId);
  if (alreadyVoted) {
    throw new Error('Você já votou nesta rodada');
  }

  // 3. O candidato precisa existir, pertencer a este campeonato e estar no
  //    elenco atual (sem_time/removido não concorrem em votação nova).
  const candidate = await getDocument<Player>('players', candidatePlayerId);
  if (!candidate || candidate.championshipId !== championshipId || !isActiveRosterPlayer(candidate)) {
    throw new Error('Candidato inválido.');
  }

  // 4. O candidato não pode ser do mesmo time do votante (quando o votante tem time).
  //    O vínculo do votante considera apenas player ATIVO — um doc 'sem_time'
  //    guarda o teamId antigo e não representa time atual.
  const voterPlayers = await getCollection<Player>('players', [
    { field: 'championshipId', operator: '==', value: championshipId },
    { field: 'userId', operator: '==', value: voterId },
  ]);
  const voterTeamId =
    voterPlayers.find((p) => !!p.teamId && isActiveRosterPlayer(p))?.teamId ?? null;
  if (voterTeamId && candidate.teamId === voterTeamId) {
    throw new Error('Você não pode votar em um jogador do seu próprio time.');
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

export function roundAwardId(championshipId: string, round: number): string {
  return `${championshipId}_${round}`;
}

// ---------------------------------------------------------------------------
// closeVoting — cria RoundAward com dados completos
// ---------------------------------------------------------------------------

export async function closeVoting(
  championshipId: string,
  round: number,
  players: Player[],
): Promise<{ award: RoundAward; created: boolean } | null> {
  // P-05: idempotência. Se a votação desta rodada já foi encerrada, retorna o
  // prêmio existente SEM criar outro. Antes, o caller usava addDocument (id
  // automático), então um duplo toque / dois dispositivos geravam RoundAwards
  // duplicados — inflando o MVP e a contagem de craque no encerramento.
  const existing = await getCollection<RoundAward>('round_awards', [
    { field: 'championshipId', operator: '==', value: championshipId },
    { field: 'round', operator: '==', value: round },
  ]);
  if (existing.length > 0) {
    const deterministic = existing.find((award) => award.id === roundAwardId(championshipId, round));
    return { award: deterministic ?? existing[0], created: false };
  }

  const results = await getVoteResults(championshipId, round);
  if (results.length === 0) return null;

  const winner = results[0];
  const winnerPlayer = players.find((p) => p.id === winner.playerId);

  // ID determinístico champ_round: no máximo um prêmio por rodada, mesmo sob corrida.
  const id = roundAwardId(championshipId, round);
  const award: RoundAward = {
    id,
    championshipId,
    round,
    winnerPlayerId: winner.playerId,
    winnerName: winnerPlayer?.name ?? '',
    winnerTeamId: winnerPlayer?.teamId ?? '',
    totalVotes: results.reduce((sum, r) => sum + r.votes, 0),
    closedAt: new Date().toISOString(),
  };

  // Escrita centralizada aqui (fonte da verdade), não mais no caller.
  await setDocument('round_awards', id, award);
  return { award, created: true };
}
