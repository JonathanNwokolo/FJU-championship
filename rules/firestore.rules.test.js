const fs = require('fs');
const path = require('path');
const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} = require('@firebase/rules-unit-testing');

const projectId = 'fju-championship';
let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function db(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function seed(data) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await Promise.all(
      Object.entries(data).map(([fullPath, value]) => admin.doc(fullPath).set(value)),
    );
  });
}

const champ = {
  organizerId: 'org',
  status: 'inscricoes_abertas',
  registrationsClosed: false,
  rules: { manualApproval: true },
};

const team = {
  championshipId: 'champ',
  captainId: 'cap',
  status: 'aprovado',
  name: 'Leoes',
  inviteCode: 'LEOES1',
  primaryColor: '#111',
  secondaryColor: '#fff',
};

describe('users and roles', () => {
  it('allows regular users to create athlete and captain profiles', async () => {
    await assertSucceeds(db('athlete').doc('users/athlete').set({ name: 'A', role: 'atleta' }));
    await assertSucceeds(db('cap').doc('users/cap').set({ name: 'C', role: 'capitao' }));
  });

  it('denies organizer self-assignment without allowlist', async () => {
    await seed({ 'users/user': { name: 'User', role: 'atleta' } });

    await assertFails(db('user').doc('users/user').update({ role: 'organizador' }));
  });

  it('does not grant organizer role because a public flag exists in the client', async () => {
    await seed({ 'users/user': { name: 'User', role: 'atleta' } });

    await assertFails(db('user').doc('users/user').update({ role: 'organizador' }));
  });

  it('allows an allowlisted uid to receive organizer role', async () => {
    await seed({
      'users/org2': { name: 'Allowed', role: 'atleta' },
      'organizer_allowlist/org2': { uid: 'org2', enabled: true },
    });

    await assertSucceeds(db('org2').doc('users/org2').update({ role: 'organizador' }));
  });

  it('denies users creating or modifying their own allowlist entry', async () => {
    await seed({ 'users/user': { name: 'User', role: 'atleta' } });

    await assertFails(db('user').doc('organizer_allowlist/user').set({ uid: 'user', enabled: true }));
    await seed({ 'organizer_allowlist/user': { uid: 'user', enabled: false } });
    await assertFails(db('user').doc('organizer_allowlist/user').update({ enabled: true }));
  });
});

describe('teams', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/otherOrg': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'championships/champ': champ,
      'championships/otherChamp': { ...champ, organizerId: 'otherOrg' },
      'teams/team': team,
    });
  });

  it('allows captain to update only permitted fields', async () => {
    await assertSucceeds(db('cap').doc('teams/team').update({ name: 'Leoes FC' }));
    await assertFails(db('cap').doc('teams/team').update({ status: 'rejeitado' }));
    await assertFails(db('cap').doc('teams/team').update({ captainId: 'other' }));
    await assertFails(db('cap').doc('teams/team').update({ championshipId: 'otherChamp' }));
  });

  it('allows owning organizer to change status and denies other organizers', async () => {
    await assertSucceeds(db('org').doc('teams/team').update({ status: 'rejeitado' }));
    await assertFails(db('otherOrg').doc('teams/team').update({ status: 'aprovado' }));
  });

  it('allows athlete leave batch to decrement own team counter without going negative', async () => {
    await seed({
      'teams/team': { ...team, approvedPlayersCount: 1, maxPlayers: 15 },
      'players/player': {
        teamId: 'team',
        championshipId: 'champ',
        userId: 'athlete',
        name: 'Athlete',
        position: 'meia',
        number: 10,
        status: 'ativo',
      },
      'team_memberships/team_athlete': {
        teamId: 'team',
        championshipId: 'champ',
        userId: 'athlete',
        playerId: 'player',
        status: 'ativo',
      },
    });

    const athleteDb = db('athlete');
    const batch = athleteDb.batch();
    batch.update(athleteDb.doc('players/player'), { status: 'sem_time', leftAt: 'now' });
    batch.update(athleteDb.doc('team_memberships/team_athlete'), {
      status: 'sem_time',
      leftAt: 'now',
      updatedAt: 'now',
    });
    batch.update(athleteDb.doc('teams/team'), { approvedPlayersCount: 0 });

    await assertSucceeds(batch.commit());
    await assertFails(athleteDb.doc('teams/team').update({ approvedPlayersCount: -1 }));
  });
});

describe('players', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'users/external': { role: 'atleta' },
      'championships/champ': champ,
      'teams/team': team,
      'players/player': {
        teamId: 'team',
        championshipId: 'champ',
        userId: 'athlete',
        name: 'Athlete',
        position: 'meia',
        number: 10,
        status: 'ativo',
      },
    });
  });

  it('allows athlete to change personal fields only', async () => {
    await assertSucceeds(db('athlete').doc('players/player').update({ name: 'Athlete Prime' }));
    await assertFails(db('athlete').doc('players/player').update({ status: 'suspenso' }));
    await assertFails(db('athlete').doc('players/player').update({ teamId: 'otherTeam' }));
  });

  it('allows legitimate captain actions and denies external users', async () => {
    await assertSucceeds(db('cap').doc('players/player').update({ status: 'suspenso' }));
    await assertFails(db('external').doc('players/player').update({ name: 'Bad Edit' }));
  });
});

describe('match events', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/otherOrg': { role: 'organizador' },
      'championships/champ': champ,
      'matches/openMatch': { championshipId: 'champ', status: 'agendado' },
      'matches/finishedMatch': { championshipId: 'champ', status: 'finalizado' },
      'match_events/finishedEvent': {
        championshipId: 'champ',
        matchId: 'finishedMatch',
        teamId: 'team',
        playerId: 'player',
        type: 'gol',
        minute: 1,
      },
    });
  });

  it('allows event creation only on editable matches by owning organizer', async () => {
    await assertSucceeds(db('org').doc('match_events/openEvent').set({
      championshipId: 'champ',
      matchId: 'openMatch',
      teamId: 'team',
      playerId: 'player',
      type: 'gol',
      minute: 5,
    }));
    await assertFails(db('org').doc('match_events/lateEvent').set({
      championshipId: 'champ',
      matchId: 'finishedMatch',
      teamId: 'team',
      playerId: 'player',
      type: 'gol',
      minute: 90,
    }));
    await assertFails(db('otherOrg').doc('match_events/otherEvent').set({
      championshipId: 'champ',
      matchId: 'openMatch',
      teamId: 'team',
      playerId: 'player',
      type: 'gol',
      minute: 8,
    }));
  });

  it('denies edit and delete after match is finalized', async () => {
    await assertFails(db('org').doc('match_events/finishedEvent').update({ minute: 2 }));
    await assertFails(db('org').doc('match_events/finishedEvent').delete());
  });

  it('allows finalized event update only inside immutable correction log batch', async () => {
    const orgDb = db('org');
    const correction = correctionData('corr1');
    const batch = orgDb.batch();
    batch.set(orgDb.doc('match_corrections/corr1'), correction);
    batch.update(orgDb.doc('match_events/finishedEvent'), {
      minute: 2,
      lastCorrectionId: 'corr1',
      correctedAt: 'now',
    });

    await assertSucceeds(batch.commit());
    await assertFails(orgDb.doc('match_corrections/corr1').update({ reason: 'edited reason' }));
    await assertFails(orgDb.doc('match_corrections/corr1').delete());
  });

  it('denies correction log and finalized event correction for non owner roles', async () => {
    const otherDb = db('otherOrg');
    const batch = otherDb.batch();
    batch.set(otherDb.doc('match_corrections/corr2'), {
      ...correctionData('corr2'),
      organizerId: 'otherOrg',
    });
    batch.update(otherDb.doc('match_events/finishedEvent'), {
      minute: 3,
      lastCorrectionId: 'corr2',
    });

    await assertFails(batch.commit());
  });
});

function correctionData(id) {
  return {
    id,
    championshipId: 'champ',
    matchId: 'finishedMatch',
    organizerId: 'org',
    reason: 'Erro de sumula',
    previousScore: { homeScore: 1, awayScore: 0 },
    newScore: { homeScore: 1, awayScore: 0 },
    previousWinnerId: 'team',
    newWinnerId: 'team',
    eventsAdded: [],
    eventsRemoved: [],
    eventsChanged: [],
    round: 1,
    championshipFormat: 'pontos_corridos',
    derivedEffects: ['placar', 'eventos'],
    previousMatchVersion: 0,
    newMatchVersion: 1,
    previousMatch: { id: 'finishedMatch', championshipId: 'champ' },
  };
}

function reprocessLogData(id = 'reprocess_champ_corr1_1') {
  return {
    id,
    reprocessId: id,
    championshipId: 'champ',
    sourceCorrectionId: 'corr1',
    sourceMatchId: 'finishedMatch',
    reason: 'Reprocessar apos correcao',
    createdBy: 'org',
    previousResultsDigest: 'before',
    newResultsDigest: 'after',
    changed: true,
    changedFields: ['winnerId'],
    affectedUserIds: ['athlete'],
    historyDeltas: [],
    achievementGrants: [],
    achievementRevocations: [],
    careerStatsAffected: ['athlete'],
    rankingsAffected: ['scorers'],
    idempotencyKey: id,
    reprocessVersion: 1,
  };
}

describe('match corrections (Bloco 4)', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/otherOrg': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'championships/champ': champ,
      'matches/finishedMatch': { championshipId: 'champ', status: 'finalizado' },
      'match_events/finishedEvent': {
        championshipId: 'champ',
        matchId: 'finishedMatch',
        teamId: 'team',
        playerId: 'player',
        type: 'gol',
        minute: 1,
      },
    });
  });

  it('cria o log apenas com todos os campos obrigatórios', async () => {
    await assertSucceeds(db('org').doc('match_corrections/ok').set(correctionData('ok')));
  });

  it('rejeita log com campo obrigatório ausente (sem reason)', async () => {
    const data = correctionData('bad');
    delete data.reason;
    await assertFails(db('org').doc('match_corrections/bad').set(data));
  });

  it('rejeita log com newMatchVersion inconsistente', async () => {
    await assertFails(
      db('org').doc('match_corrections/bad2').set({ ...correctionData('bad2'), newMatchVersion: 5 }),
    );
  });

  it('rejeita reason curto demais', async () => {
    await assertFails(
      db('org').doc('match_corrections/bad3').set({ ...correctionData('bad3'), reason: 'ab' }),
    );
  });

  it('o log é imutável e não pode ser deletado', async () => {
    await seed({ 'match_corrections/imut': correctionData('imut') });
    await assertFails(db('org').doc('match_corrections/imut').update({ reason: 'motivo novo' }));
    await assertFails(db('org').doc('match_corrections/imut').delete());
  });

  it('organizador externo não cria log no campeonato alheio', async () => {
    await assertFails(
      db('otherOrg')
        .doc('match_corrections/ext')
        .set({ ...correctionData('ext'), organizerId: 'otherOrg' }),
    );
  });

  it('capitão e atleta não corrigem evento finalizado nem mesmo via batch', async () => {
    for (const uid of ['cap', 'athlete']) {
      const d = db(uid);
      const batch = d.batch();
      batch.set(d.doc(`match_corrections/by-${uid}`), {
        ...correctionData(`by-${uid}`),
        organizerId: uid,
      });
      batch.update(d.doc('match_events/finishedEvent'), { minute: 9, lastCorrectionId: `by-${uid}` });
      await assertFails(batch.commit());
    }
  });

  it('evento finalizado não muda sem o log de correção que o autorize', async () => {
    await assertFails(db('org').doc('match_events/finishedEvent').update({ minute: 7 }));
  });
});

function statusChangeData(id, overrides = {}) {
  return {
    id,
    championshipId: 'champ',
    matchId: 'scheduledMatch',
    organizerId: 'org',
    type: 'wo',
    reason: 'Time nao compareceu',
    beforeStatus: 'agendado',
    afterStatus: 'wo',
    beforeDate: null,
    afterDate: null,
    beforeScore: { homeScore: null, awayScore: null },
    afterScore: { homeScore: 3, awayScore: 0 },
    winnerId: 'team',
    version: 1,
    derivedEffects: ['status', 'placar', 'classificacao'],
    ...overrides,
  };
}

describe('match status changes (Bloco 5 - Fase A)', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/otherOrg': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'championships/champ': champ,
      'matches/scheduledMatch': { championshipId: 'champ', status: 'agendado' },
      'matches/woMatch': { championshipId: 'champ', status: 'wo' },
      'matches/cancelledMatch': { championshipId: 'champ', status: 'cancelado' },
      'matches/postponedMatch': { championshipId: 'champ', status: 'adiado' },
      'match_events/finishedEvent': {
        championshipId: 'champ',
        matchId: 'scheduledMatch',
        teamId: 'team',
        playerId: 'player',
        type: 'gol',
        minute: 1,
      },
    });
  });

  it('organizador dono cria o log com todos os campos obrigatórios', async () => {
    await assertSucceeds(db('org').doc('match_status_changes/ok').set(statusChangeData('ok')));
  });

  it('rejeita log com motivo curto demais', async () => {
    await assertFails(
      db('org').doc('match_status_changes/bad').set(statusChangeData('bad', { reason: 'ab' })),
    );
  });

  it('rejeita log com type inválido', async () => {
    await assertFails(
      db('org').doc('match_status_changes/bad2').set(statusChangeData('bad2', { type: 'qualquer' })),
    );
  });

  it('rejeita log sem version inteira', async () => {
    const data = statusChangeData('bad3');
    delete data.version;
    await assertFails(db('org').doc('match_status_changes/bad3').set(data));
  });

  it('organizador externo não cria log no campeonato alheio', async () => {
    await assertFails(
      db('otherOrg')
        .doc('match_status_changes/ext')
        .set(statusChangeData('ext', { organizerId: 'otherOrg' })),
    );
  });

  it('capitão e atleta não criam log de status', async () => {
    for (const uid of ['cap', 'athlete']) {
      await assertFails(
        db(uid).doc(`match_status_changes/by-${uid}`).set(statusChangeData(`by-${uid}`, { organizerId: uid })),
      );
    }
  });

  it('o log é imutável e não pode ser deletado', async () => {
    await seed({ 'match_status_changes/imut': statusChangeData('imut') });
    await assertFails(db('org').doc('match_status_changes/imut').update({ reason: 'outro motivo' }));
    await assertFails(db('org').doc('match_status_changes/imut').delete());
  });

  it('atleta não lê log de status; organizador dono lê', async () => {
    await seed({ 'match_status_changes/readable': statusChangeData('readable') });
    await assertFails(db('athlete').doc('match_status_changes/readable').get());
    await assertSucceeds(db('org').doc('match_status_changes/readable').get());
  });

  it('eventos não podem ser criados em partida adiada/cancelada/W.O.', async () => {
    for (const matchId of ['woMatch', 'cancelledMatch', 'postponedMatch']) {
      await assertFails(
        db('org').doc(`match_events/evt-${matchId}`).set({
          championshipId: 'champ',
          matchId,
          teamId: 'team',
          playerId: 'player',
          type: 'gol',
          minute: 5,
        }),
      );
    }
  });
});

describe('championship reprocess logs (Bloco 11 Fase 3)', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/otherOrg': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'championships/champ': champ,
      'matches/finishedMatch': { championshipId: 'champ', status: 'finalizado' },
      'match_corrections/corr1': correctionData('corr1'),
    });
  });

  it('permite criar log apenas para o organizador dono e com correcao ligada', async () => {
    await assertSucceeds(
      db('org').doc('championship_reprocess_logs/reprocess_champ_corr1_1').set(reprocessLogData()),
    );
    await assertFails(
      db('otherOrg')
        .doc('championship_reprocess_logs/reprocess_champ_corr1_2')
        .set({ ...reprocessLogData('reprocess_champ_corr1_2'), createdBy: 'otherOrg' }),
    );
    await assertFails(
      db('athlete')
        .doc('championship_reprocess_logs/reprocess_champ_corr1_3')
        .set({ ...reprocessLogData('reprocess_champ_corr1_3'), createdBy: 'athlete' }),
    );
  });

  it('mantem log de reprocessamento imutavel', async () => {
    await seed({
      'championship_reprocess_logs/reprocess_champ_corr1_1': reprocessLogData(),
    });

    await assertFails(
      db('org').doc('championship_reprocess_logs/reprocess_champ_corr1_1').update({ reason: 'editado' }),
    );
    await assertFails(db('org').doc('championship_reprocess_logs/reprocess_champ_corr1_1').delete());
  });
});

describe('player_history reprocess updates', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/otherOrg': { role: 'organizador' },
      'users/athlete': { role: 'atleta' },
      'championships/champ': champ,
      'player_history/hist-athlete': {
        id: 'hist-athlete',
        userId: 'athlete',
        championshipId: 'champ',
        championshipName: 'Copa',
        teamId: 'team',
        teamName: 'Leoes',
        season: '2026',
        goals: 1,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
        matchesPlayed: 1,
        overall: 80,
        finishedAt: '2026-01-01',
        position: 'atacante',
        isChampion: true,
        isMvp: false,
        roundMvpCount: 0,
      },
    });
  });

  it('permite update pelo organizador dono e bloqueia demais papeis', async () => {
    await assertSucceeds(db('org').doc('player_history/hist-athlete').update({ goals: 2 }));
    await assertFails(db('otherOrg').doc('player_history/hist-athlete').update({ goals: 3 }));
    await assertFails(db('athlete').doc('player_history/hist-athlete').update({ goals: 4 }));
    await assertFails(db('org').doc('player_history/hist-athlete').delete());
  });
});

describe('achievements', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/otherOrg': { role: 'organizador' },
      'users/athlete': { role: 'atleta' },
      'championships/champ': champ,
      'players/player': { championshipId: 'champ', teamId: 'team', userId: 'athlete', status: 'ativo' },
    });
  });

  it('denies self-awards and allows only the owning organizer', async () => {
    const award = { achievementId: 'hat-trick', playerId: 'player', championshipId: 'champ' };

    await assertFails(db('athlete').doc('players/player/achievements/a1').set(award));
    await assertSucceeds(db('org').doc('players/player/achievements/a1').set(award));
    await assertFails(db('otherOrg').doc('players/player/achievements/a2').set(award));
  });
});

describe('announcements', () => {
  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/cap2': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'users/otherAthlete': { role: 'atleta' },
      'users/noTeam': { role: 'atleta' },
      'championships/champ': champ,
      'championships/champ2': { ...champ, organizerId: 'org' },
      'teams/team': team,
      'teams/otherTeam': { ...team, captainId: 'cap2', championshipId: 'champ2' },
      'team_memberships/team_athlete': {
        teamId: 'team',
        championshipId: 'champ',
        userId: 'athlete',
        playerId: 'player',
        status: 'ativo',
      },
      'team_memberships/otherTeam_otherAthlete': {
        teamId: 'otherTeam',
        championshipId: 'champ2',
        userId: 'otherAthlete',
        playerId: 'otherPlayer',
        status: 'ativo',
      },
      'announcements/teamNotice': {
        championshipId: 'champ',
        authorId: 'org',
        targetAudience: 'time_especifico',
        targetTeamId: 'team',
        readBy: [],
      },
      'announcements/publicNotice': {
        championshipId: 'champ',
        authorId: 'org',
        targetAudience: 'todos',
        readBy: [],
      },
    });
  });

  it('allows legitimate team members, captain, and organizer to read team announcements', async () => {
    await assertSucceeds(db('athlete').doc('announcements/teamNotice').get());
    await assertSucceeds(db('cap').doc('announcements/teamNotice').get());
    await assertSucceeds(db('org').doc('announcements/teamNotice').get());
  });

  it('denies team announcements to other teams and users without team', async () => {
    await assertFails(db('otherAthlete').doc('announcements/teamNotice').get());
    await assertFails(db('noTeam').doc('announcements/teamNotice').get());
  });

  it('allows public announcements to signed-in users', async () => {
    await assertSucceeds(db('noTeam').doc('announcements/publicNotice').get());
  });

  it('denies captain creating announcement for another championship or team', async () => {
    await assertFails(db('cap2').doc('announcements/badCreate').set({
      championshipId: 'champ',
      authorId: 'cap2',
      targetAudience: 'time_especifico',
      targetTeamId: 'team',
      readBy: [],
    }));
  });

  it('allows captain to create for their own team and championship', async () => {
    await assertSucceeds(db('cap').doc('announcements/captainCreate').set({
      championshipId: 'champ',
      authorId: 'cap',
      targetAudience: 'time_especifico',
      targetTeamId: 'team',
      readBy: [],
    }));
  });
});

// ── Bloco 5 — Fase B: convocação e presença ─────────────────────────────────
describe('match_convocations', () => {
  const MATCH = 'm1';
  const CONV = `${MATCH}_team`;

  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/otherOrg': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/cap2': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'championships/champ': { ...champ, organizerId: 'org' },
      'teams/team': team,
      'teams/team2': { ...team, captainId: 'cap2', name: 'Outro' },
      'matches/m1': { championshipId: 'champ', homeTeamId: 'team', awayTeamId: 'team2', status: 'agendado', round: 1 },
      'matches/m1-live': { championshipId: 'champ', homeTeamId: 'team', awayTeamId: 'team2', status: 'ao_vivo', round: 1 },
    });
  });

  const baseConv = (over = {}) => ({
    championshipId: 'champ',
    matchId: MATCH,
    teamId: 'team',
    captainId: 'cap',
    playerIds: ['p1'],
    status: 'open',
    version: 1,
    ...over,
  });

  it('captain creates own convocation with version 1, deterministic id', async () => {
    await assertSucceeds(db('cap').doc(`match_convocations/${CONV}`).set(baseConv()));
  });

  it('owning organizer can create', async () => {
    await assertSucceeds(db('org').doc(`match_convocations/${CONV}`).set(baseConv()));
  });

  it('captain of another team is denied', async () => {
    await assertFails(db('cap2').doc(`match_convocations/${CONV}`).set(baseConv()));
  });

  it('athlete cannot create', async () => {
    await assertFails(db('athlete').doc(`match_convocations/${CONV}`).set(baseConv()));
  });

  it('mismatched id (matchId_teamId) is denied', async () => {
    await assertFails(db('cap').doc('match_convocations/wrong_id').set(baseConv()));
  });

  it('version != 1 on create is denied', async () => {
    await assertFails(db('cap').doc(`match_convocations/${CONV}`).set(baseConv({ version: 2 })));
  });

  it('started match blocks captain creation', async () => {
    const conv = baseConv({ matchId: 'm1-live' });
    await assertFails(db('cap').doc('match_convocations/m1-live_team').set(conv));
  });

  it('captain edits: version must increment, ids immutable', async () => {
    await seed({ [`match_convocations/${CONV}`]: baseConv() });
    await assertSucceeds(
      db('cap').doc(`match_convocations/${CONV}`).update({ playerIds: ['p1', 'p2'], version: 2 }),
    );
    await assertFails(
      db('cap').doc(`match_convocations/${CONV}`).update({ playerIds: ['p1'], version: 1 }),
    );
    await assertFails(
      db('cap').doc(`match_convocations/${CONV}`).update({ teamId: 'team2', version: 2 }),
    );
  });

  it('organizer can set terminal status (cancelled) even after match closes', async () => {
    await seed({
      [`match_convocations/${CONV}`]: baseConv(),
      'matches/m1': { championshipId: 'champ', homeTeamId: 'team', awayTeamId: 'team2', status: 'cancelado', round: 1 },
    });
    await assertSucceeds(
      db('org').doc(`match_convocations/${CONV}`).update({ status: 'cancelled', version: 2 }),
    );
  });

  it('nobody can delete a convocation', async () => {
    await seed({ [`match_convocations/${CONV}`]: baseConv() });
    await assertFails(db('org').doc(`match_convocations/${CONV}`).delete());
    await assertFails(db('cap').doc(`match_convocations/${CONV}`).delete());
  });
});

describe('match_attendance', () => {
  const MATCH = 'm1';
  const CONV = `${MATCH}_team`;
  const ATT = `${MATCH}_p1`;

  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'users/other': { role: 'atleta' },
      'championships/champ': { ...champ, organizerId: 'org' },
      'teams/team': team,
      'matches/m1': { championshipId: 'champ', homeTeamId: 'team', awayTeamId: 'team2', status: 'agendado', round: 1 },
      'matches/m1-live': { championshipId: 'champ', homeTeamId: 'team', awayTeamId: 'team2', status: 'ao_vivo', round: 1 },
      'players/p1': { userId: 'athlete', teamId: 'team', championshipId: 'champ', name: 'A', status: 'ativo' },
      [`match_convocations/${CONV}`]: {
        championshipId: 'champ', matchId: MATCH, teamId: 'team', captainId: 'cap',
        playerIds: ['p1'], status: 'open', version: 1,
      },
    });
  });

  const baseAtt = (over = {}) => ({
    championshipId: 'champ',
    matchId: MATCH,
    teamId: 'team',
    playerId: 'p1',
    userId: 'athlete',
    response: 'confirmed',
    version: 1,
    reconfirmationRequired: false,
    previousResponse: null,
    ...over,
  });

  it('convoked athlete confirms own attendance', async () => {
    await assertSucceeds(db('athlete').doc(`match_attendance/${ATT}`).set(baseAtt()));
  });

  it('responding for another athlete is denied', async () => {
    await assertFails(db('other').doc(`match_attendance/${ATT}`).set(baseAtt()));
  });

  it('organizer cannot fabricate a response', async () => {
    await assertFails(db('org').doc(`match_attendance/${ATT}`).set(baseAtt()));
  });

  it('non-convoked athlete is denied', async () => {
    await seed({
      [`match_convocations/${CONV}`]: {
        championshipId: 'champ', matchId: MATCH, teamId: 'team', captainId: 'cap',
        playerIds: ['pX'], status: 'open', version: 1,
      },
    });
    await assertFails(db('athlete').doc(`match_attendance/${ATT}`).set(baseAtt()));
  });

  it('started match blocks responses', async () => {
    await seed({
      'matches/m1': { championshipId: 'champ', homeTeamId: 'team', awayTeamId: 'team2', status: 'ao_vivo', round: 1 },
    });
    await assertFails(db('athlete').doc(`match_attendance/${ATT}`).set(baseAtt()));
  });

  it('closed convocation blocks responses', async () => {
    await seed({
      [`match_convocations/${CONV}`]: {
        championshipId: 'champ', matchId: MATCH, teamId: 'team', captainId: 'cap',
        playerIds: ['p1'], status: 'cancelled', version: 2,
      },
    });
    await assertFails(db('athlete').doc(`match_attendance/${ATT}`).set(baseAtt()));
  });

  it('athlete changes own response (version increments)', async () => {
    await seed({ [`match_attendance/${ATT}`]: baseAtt() });
    await assertSucceeds(
      db('athlete').doc(`match_attendance/${ATT}`).update({ response: 'declined', version: 2 }),
    );
  });

  it('stale version is denied', async () => {
    await seed({ [`match_attendance/${ATT}`]: baseAtt() });
    await assertFails(
      db('athlete').doc(`match_attendance/${ATT}`).update({ response: 'declined', version: 1 }),
    );
  });

  it('changing immutable ids is denied', async () => {
    await seed({ [`match_attendance/${ATT}`]: baseAtt() });
    await assertFails(
      db('athlete').doc(`match_attendance/${ATT}`).update({ playerId: 'pX', version: 2 }),
    );
  });

  it('organizer may mark reconfirmation but not change the response', async () => {
    await seed({ [`match_attendance/${ATT}`]: baseAtt() });
    await assertSucceeds(
      db('org').doc(`match_attendance/${ATT}`).update({
        reconfirmationRequired: true,
        previousResponse: 'confirmed',
        version: 2,
        updatedAt: 'now',
      }),
    );
    await assertFails(
      db('org').doc(`match_attendance/${ATT}`).update({ response: 'declined', version: 2 }),
    );
  });

  it('nobody can delete attendance', async () => {
    await seed({ [`match_attendance/${ATT}`]: baseAtt() });
    await assertFails(db('athlete').doc(`match_attendance/${ATT}`).delete());
    await assertFails(db('org').doc(`match_attendance/${ATT}`).delete());
  });
});

describe('group stage transition rules', () => {
  const snapshotId = 'champ__champ__group_snapshot__1';
  const logId = 'group_transition_champ_1';

  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'users/otherOrg': { role: 'organizador' },
      'championships/champ': {
        ...champ,
        organizerId: 'org',
        format: 'grupos_e_mata_mata',
        groupGenerationVersion: 1,
        groupFixturesVersion: 1,
      },
    });
  });

  const snapshot = (over = {}) => ({
    id: snapshotId,
    version: 1,
    championshipId: 'champ',
    groupGenerationVersion: 1,
    groupFixturesVersion: 1,
    structureVersion: 1,
    configVersion: 1,
    qualifiersPerGroup: 1,
    qualifiers: [{ teamId: 't1', groupId: 'A', groupPosition: 1 }],
    standingsDigest: 'digest-1',
    generatedBy: 'org',
    generatedAt: new Date(),
    ...over,
  });

  const transitionLog = (over = {}) => ({
    id: logId,
    championshipId: 'champ',
    transitionVersion: 1,
    snapshotId,
    snapshotDigest: 'digest-1',
    knockoutGenerationVersion: 1,
    qualifierIds: ['t1', 't2'],
    fixtureIds: ['m1'],
    createdBy: 'org',
    createdAt: new Date(),
    ...over,
  });

  it('owning organizer can create immutable snapshot and transition log', async () => {
    await assertSucceeds(db('org').doc(`group_stage_snapshots/${snapshotId}`).set(snapshot()));
    await assertSucceeds(db('org').doc(`group_transition_logs/${logId}`).set(transitionLog()));
  });

  it('captain, athlete and other organizer cannot create snapshot or log', async () => {
    await assertFails(db('cap').doc(`group_stage_snapshots/${snapshotId}`).set(snapshot({ generatedBy: 'cap' })));
    await assertFails(db('athlete').doc(`group_stage_snapshots/${snapshotId}`).set(snapshot({ generatedBy: 'athlete' })));
    await assertFails(db('otherOrg').doc(`group_transition_logs/${logId}`).set(transitionLog({ createdBy: 'otherOrg' })));
  });

  it('snapshot and log cannot be updated or deleted after creation', async () => {
    await seed({
      [`group_stage_snapshots/${snapshotId}`]: snapshot(),
      [`group_transition_logs/${logId}`]: transitionLog(),
    });

    await assertFails(db('org').doc(`group_stage_snapshots/${snapshotId}`).update({ standingsDigest: 'changed' }));
    await assertFails(db('org').doc(`group_transition_logs/${logId}`).update({ snapshotDigest: 'changed' }));
    await assertFails(db('org').doc(`group_stage_snapshots/${snapshotId}`).delete());
    await assertFails(db('org').doc(`group_transition_logs/${logId}`).delete());
  });

  it('requires deterministic document id fields to match', async () => {
    await assertFails(
      db('org').doc(`group_stage_snapshots/${snapshotId}`).set(snapshot({ id: 'random' })),
    );
    await assertFails(
      db('org').doc(`group_transition_logs/${logId}`).set(transitionLog({ id: 'random' })),
    );
  });
});

describe('group assignment and fixture logs (Bloco 10.5)', () => {
  const assignmentLogId = 'group_assignment_champ_1';
  const fixtureLogId = 'group_fixtures_champ_1';

  beforeEach(async () => {
    await seed({
      'users/org': { role: 'organizador' },
      'users/cap': { role: 'capitao' },
      'users/athlete': { role: 'atleta' },
      'users/otherOrg': { role: 'organizador' },
      'championships/champ': {
        ...champ,
        organizerId: 'org',
        format: 'grupos_e_mata_mata',
        groupGenerationVersion: 1,
        groupFixturesVersion: 1,
      },
    });
  });

  const assignmentLog = (over = {}) => ({
    id: assignmentLogId,
    championshipId: 'champ',
    generationVersion: 1,
    algorithmVersion: 1,
    drawSeed: 'seed-1',
    assignments: [{ teamId: 't1', groupId: 'A', groupSeed: 1, assignmentOrder: 0 }],
    createdBy: 'org',
    createdAt: new Date(),
    ...over,
  });

  const fixtureLog = (over = {}) => ({
    id: fixtureLogId,
    championshipId: 'champ',
    fixturesVersion: 1,
    groupGenerationVersion: 1,
    structureVersion: 1,
    fixtureIds: ['m1', 'm2'],
    fixtureCount: 2,
    groupCounts: { groupA: 1, groupB: 1 },
    createdBy: 'org',
    createdAt: new Date(),
    ...over,
  });

  it('owning organizer can create both immutable logs', async () => {
    await assertSucceeds(db('org').doc(`group_assignment_logs/${assignmentLogId}`).set(assignmentLog()));
    await assertSucceeds(db('org').doc(`group_fixture_logs/${fixtureLogId}`).set(fixtureLog()));
  });

  it('captain, athlete and other organizer cannot create the logs', async () => {
    await assertFails(db('cap').doc(`group_assignment_logs/${assignmentLogId}`).set(assignmentLog({ createdBy: 'cap' })));
    await assertFails(db('athlete').doc(`group_fixture_logs/${fixtureLogId}`).set(fixtureLog({ createdBy: 'athlete' })));
    await assertFails(db('otherOrg').doc(`group_assignment_logs/${assignmentLogId}`).set(assignmentLog({ createdBy: 'otherOrg' })));
  });

  it('logs cannot be updated or deleted after creation', async () => {
    await seed({
      [`group_assignment_logs/${assignmentLogId}`]: assignmentLog(),
      [`group_fixture_logs/${fixtureLogId}`]: fixtureLog(),
    });
    await assertFails(db('org').doc(`group_assignment_logs/${assignmentLogId}`).update({ drawSeed: 'changed' }));
    await assertFails(db('org').doc(`group_fixture_logs/${fixtureLogId}`).update({ fixtureCount: 99 }));
    await assertFails(db('org').doc(`group_assignment_logs/${assignmentLogId}`).delete());
    await assertFails(db('org').doc(`group_fixture_logs/${fixtureLogId}`).delete());
  });

  it('requires deterministic document id fields and required shape', async () => {
    await assertFails(db('org').doc(`group_assignment_logs/${assignmentLogId}`).set(assignmentLog({ id: 'random' })));
    await assertFails(db('org').doc(`group_fixture_logs/${fixtureLogId}`).set(fixtureLog({ id: 'random' })));
    // algorithmVersion/structureVersion errados são rejeitados.
    await assertFails(db('org').doc(`group_assignment_logs/${assignmentLogId}`).set(assignmentLog({ algorithmVersion: 2 })));
    await assertFails(db('org').doc(`group_fixture_logs/${fixtureLogId}`).set(fixtureLog({ structureVersion: 2 })));
  });

  it('any signed-in user can read the logs', async () => {
    await seed({
      [`group_assignment_logs/${assignmentLogId}`]: assignmentLog(),
      [`group_fixture_logs/${fixtureLogId}`]: fixtureLog(),
    });
    await assertSucceeds(db('athlete').doc(`group_assignment_logs/${assignmentLogId}`).get());
    await assertSucceeds(db('cap').doc(`group_fixture_logs/${fixtureLogId}`).get());
  });
});
