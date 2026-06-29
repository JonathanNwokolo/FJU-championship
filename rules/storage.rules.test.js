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
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: fs.readFileSync(path.join(__dirname, '..', 'storage.rules'), 'utf8'),
    },
  });
});

afterAll(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const admin = context.firestore();
    await Promise.all([
      admin.doc('users/org').set({ role: 'organizador' }),
      admin.doc('users/cap').set({ role: 'capitao' }),
      admin.doc('users/user').set({ role: 'atleta' }),
      admin.doc('users/other').set({ role: 'atleta' }),
      admin.doc('championships/champ').set({ organizerId: 'org' }),
      admin.doc('teams/team').set({ championshipId: 'champ', captainId: 'cap' }),
      admin.doc('players/player').set({
        championshipId: 'champ',
        teamId: 'team',
        userId: 'user',
      }),
    ]);
  });
});

function storage(uid) {
  return testEnv.authenticatedContext(uid).storage().ref();
}

function image(size = 8) {
  return Buffer.alloc(size, 1);
}

describe('storage rules', () => {
  it('allows user image upload only in the own path', async () => {
    await assertSucceeds(storage('user').child('users/user/avatar.jpg').put(image(), {
      contentType: 'image/jpeg',
    }));
    await assertFails(storage('other').child('users/user/avatar.jpg').put(image(), {
      contentType: 'image/jpeg',
    }));
  });

  it('allows authorized captain to upload own team asset and denies outsiders', async () => {
    await assertSucceeds(storage('cap').child('teams/team/logo.png').put(image(), {
      contentType: 'image/png',
    }));
    await assertFails(storage('other').child('teams/team/logo.png').put(image(), {
      contentType: 'image/png',
    }));
  });

  it('denies arbitrary paths', async () => {
    await assertFails(storage('user').child('misc/free-write.jpg').put(image(), {
      contentType: 'image/jpeg',
    }));
  });

  it('denies non-images', async () => {
    await assertFails(storage('user').child('users/user/file.txt').put(image(), {
      contentType: 'text/plain',
    }));
  });

  it('enforces maximum image size', async () => {
    await assertFails(storage('user').child('users/user/huge.jpg').put(image((5 * 1024 * 1024) + 1), {
      contentType: 'image/jpeg',
    }));
  });
});
