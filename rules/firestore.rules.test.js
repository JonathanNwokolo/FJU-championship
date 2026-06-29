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
