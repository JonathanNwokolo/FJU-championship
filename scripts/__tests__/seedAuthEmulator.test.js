const {
  assertAuthEmulatorTarget,
  buildTestAuthUsers,
  parseArgs,
  seedAuthUsers,
} = require('../seedAuthEmulator');
const { assertSafeTarget } = require('../seedOperationalValidation');

describe('seedAuthEmulator', () => {
  it('recusa execucao sem Auth Emulator', () => {
    expect(() => assertAuthEmulatorTarget('fju-operational-emulator', null)).toThrow(
      /FIREBASE_AUTH_EMULATOR_HOST/,
    );
  });

  it('recusa project id com cara de producao', () => {
    expect(() => assertAuthEmulatorTarget('fju-championship', '127.0.0.1:9099')).toThrow(
      /producao/,
    );
  });

  it('recusa seed operacional contra project id de producao', () => {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

    expect(() => assertSafeTarget('fju-championship')).toThrow(/producao/);

    delete process.env.FIRESTORE_EMULATOR_HOST;
  });

  it('cria usuarios de teste deterministicos a partir do seed operacional', () => {
    const users = buildTestAuthUsers('test-password');
    const ids = users.map((user) => user.uid);

    expect(users).toHaveLength(16);
    expect(ids).toContain('ov_org_owner');
    expect(ids).toContain('ov_cap_alpha');
    expect(users.every((user) => user.email.endsWith('@operational.fju.local'))).toBe(true);
  });

  it('parseia reset e project id', () => {
    expect(parseArgs(['--reset', '--project-id=fju-dev-emulator'])).toEqual({
      reset: true,
      projectId: 'fju-dev-emulator',
    });
  });

  it('atualiza usuario existente e segue idempotente', async () => {
    const auth = {
      createUser: jest
        .fn()
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce({ code: 'auth/uid-already-exists' }),
      updateUser: jest.fn().mockResolvedValue({}),
    };
    const users = [
      { uid: 'ov_1', email: 'ov_1@operational.fju.local', displayName: 'Um', password: 'x' },
      { uid: 'ov_2', email: 'ov_2@operational.fju.local', displayName: 'Dois', password: 'x' },
    ];

    const result = await seedAuthUsers(auth, users);

    expect(result).toEqual({ created: 1, updated: 1, total: 2 });
    expect(auth.updateUser).toHaveBeenCalledWith('ov_2', {
      email: 'ov_2@operational.fju.local',
      emailVerified: undefined,
      displayName: 'Dois',
      password: 'x',
    });
  });
});
