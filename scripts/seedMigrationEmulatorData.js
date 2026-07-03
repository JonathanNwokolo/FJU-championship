const { assertSafety, initializeFirestore } = require('./migration/firestoreAdmin');

function parseProjectId(argv) {
  const arg = argv.find((item) => item.startsWith('--project-id='));
  return arg ? arg.split('=')[1] : process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || 'fju-migration-emulator';
}

const docs = {
  'users/u1': { id: 'u1', name: 'Atleta Um', role: 'atleta' },
  'users/u2': { id: 'u2', name: 'Atleta Dois', role: 'atleta' },
  'users/cap1': { id: 'cap1', name: 'Capitao', role: 'capitao' },
  'championships/champ1': {
    id: 'champ1',
    name: 'Campeonato Migração',
    format: 'pontos_corridos',
    status: 'inscricoes_abertas',
    currentRound: 1,
    totalRounds: 1,
    organizerId: 'org',
    inviteCode: 'ABC123',
    maxPlayers: 3,
    maxTeams: 3,
    registeredTeamsCount: 3,
    rules: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: [], fairPlay: true, craqueDaRodada: true },
  },
  'teams/team1': {
    id: 'team1',
    championshipId: 'champ1',
    name: 'Time Um',
    primaryColor: '#111',
    secondaryColor: '#eee',
    captainId: 'cap1',
    status: 'aprovado',
    inviteCode: 'T1',
    createdAt: '2026-01-01T00:00:00.000Z',
    approvedPlayersCount: -1,
  },
  'teams/team2': {
    id: 'team2',
    championshipId: 'champ1',
    name: 'Time Dois',
    primaryColor: '#222',
    secondaryColor: '#eee',
    captainId: 'missing',
    status: 'aprovado',
    inviteCode: 'T2',
    createdAt: '2026-01-01T00:00:00.000Z',
    approvedPlayersCount: 1,
  },
  'teams/rejected': {
    id: 'rejected',
    championshipId: 'champ1',
    name: 'Rejeitado',
    primaryColor: '#333',
    secondaryColor: '#eee',
    captainId: 'cap1',
    status: 'rejeitado',
    inviteCode: 'RJ',
    createdAt: '2026-01-01T00:00:00.000Z',
    approvedPlayersCount: 0,
  },
  'players/p1': { id: 'p1', teamId: 'team1', championshipId: 'champ1', userId: 'u1', name: 'Atleta Um', position: 'meia', number: 10, status: 'ativo' },
  'players/p2': { id: 'p2', teamId: 'team1', championshipId: 'champ1', userId: 'u2', name: 'Atleta Dois', position: 'meia', number: 10, status: 'ativo' },
  'players/p2b': { id: 'p2b', teamId: 'team2', championshipId: 'champ1', userId: 'u2', name: 'Atleta Dois', position: 'meia', number: 8, status: 'ativo' },
  'players/removed': { id: 'removed', teamId: 'team1', championshipId: 'champ1', userId: 'u3', name: 'Removido', position: 'meia', number: 9, status: 'removido' },
  'matches/m1': { id: 'm1', championshipId: 'champ1', round: 1, homeTeamId: 'team1', awayTeamId: 'team2', homeScore: 0, awayScore: 0, status: 'agendado' },
  'matches/m2': { id: 'm2', championshipId: 'champ1', round: 1, homeTeamId: 'team1', awayTeamId: 'rejected', homeScore: 0, awayScore: 0, status: 'agendado' },
  'matches/wo-bad': { id: 'wo-bad', championshipId: 'champ1', round: 2, homeTeamId: 'team1', awayTeamId: 'team2', homeScore: 2, awayScore: 0, status: 'wo' },
  'match_attendance/m1_p2': { id: 'm1_p2', championshipId: 'champ1', matchId: 'm1', teamId: 'team1', playerId: 'p2', userId: 'u2', response: 'confirmed', version: 1, reconfirmationRequired: false, previousResponse: null },
  'round_awards/legacy-auto': { id: 'legacy-auto', championshipId: 'champ1', round: 1, winnerPlayerId: 'p1', winnerName: 'Atleta Um', winnerTeamId: 'team1', totalVotes: 3, closedAt: '2026-01-02T00:00:00.000Z' },
  'round_awards/champ1_1': { id: 'champ1_1', championshipId: 'champ1', round: 1, winnerPlayerId: 'p2', winnerName: 'Atleta Dois', winnerTeamId: 'team1', totalVotes: 4, closedAt: '2026-01-03T00:00:00.000Z' },
  'championship_results/champ1': { id: 'champ1', championshipId: 'champ1', totalTeams: 99, winnerId: 'missing-team', winnerName: 'Fantasma' },
  'teams/team1/convocations/99': { playerIds: ['p1'], createdAt: '2026-01-01T00:00:00.000Z' },
  'teams/team2/convocations/1': { playerIds: ['p2b'], createdAt: '2026-01-01T00:00:00.000Z' },
};

async function main() {
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
  const projectId = parseProjectId(process.argv.slice(2));
  const args = { projectId, apply: true, confirmProduction: false };
  assertSafety(args);
  const db = initializeFirestore(projectId);
  const batch = db.batch();
  for (const [path, data] of Object.entries(docs)) {
    batch.set(db.doc(path), data);
  }
  await batch.commit();
  console.log(`[seed:migrations] dataset gravado no Emulator (${Object.keys(docs).length} documentos).`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[seed:migrations] falha:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { docs };
