import { createAppConfig, resolveFirebaseEmulatorHost } from '../config/appConfig';

describe('appConfig', () => {
  const originalEnv = process.env;

  function loadConfig(): typeof import('../config/appConfig') {
    let config: typeof import('../config/appConfig') | undefined;
    jest.isolateModules(() => {
      config = require('../config/appConfig');
    });
    return config!;
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_APP_ENV;
    delete process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR;
    delete process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST;
    delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.EXPO_PUBLIC_USE_MOCK;
    delete process.env.EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN;
    delete process.env.JEST_WORKER_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('resolve development com Emulator explicito', () => {
    const config = createAppConfig({
      appEnv: 'development',
      useFirebaseEmulator: 'true',
      firebaseProjectId: 'fju-operational-emulator',
    });

    expect(config.appEnv).toBe('development');
    expect(config.firebase.projectId).toBe('fju-operational-emulator');
    expect(config.firebaseEmulator.enabled).toBe(true);
  });

  it('bloqueia development sem Emulator apontando para producao', () => {
    expect(() =>
      createAppConfig({
        appEnv: 'development',
        useFirebaseEmulator: 'false',
        firebaseProjectId: 'fju-championship',
      }),
    ).toThrow(/development sem Emulator/);
  });

  it('bloqueia production com Emulator', () => {
    expect(() =>
      createAppConfig({
        appEnv: 'production',
        useFirebaseEmulator: 'true',
        firebaseProjectId: 'fju-championship',
      }),
    ).toThrow(/production nunca pode usar Firebase Emulator/);
  });

  it('resolve staging sem Emulator', () => {
    const config = createAppConfig({
      appEnv: 'staging',
      useFirebaseEmulator: 'false',
      firebaseProjectId: 'fju-championship-staging',
    });

    expect(config.appEnv).toBe('staging');
    expect(config.firebase.projectId).toBe('fju-championship-staging');
    expect(config.firebaseEmulator.enabled).toBe(false);
  });

  it('rejeita env invalida', () => {
    expect(() =>
      createAppConfig({
        appEnv: 'preview',
        useFirebaseEmulator: 'false',
      }),
    ).toThrow(/EXPO_PUBLIC_APP_ENV/);
  });

  it('rejeita flag de Emulator ausente', () => {
    expect(() =>
      createAppConfig({
        appEnv: 'development',
      }),
    ).toThrow(/EXPO_PUBLIC_USE_FIREBASE_EMULATOR/);
  });

  it('respeita host customizado', () => {
    const config = createAppConfig(
      {
        appEnv: 'development',
        useFirebaseEmulator: 'true',
        firebaseProjectId: 'fju-operational-emulator',
        firebaseEmulatorHost: 'http://192.168.1.50/',
      },
      'android',
    );

    expect(config.firebaseEmulator.host).toBe('192.168.1.50');
  });

  it('resolve Android Emulator para 10.0.2.2', () => {
    expect(resolveFirebaseEmulatorHost('android')).toBe('10.0.2.2');
  });

  it('resolve web para localhost seguro', () => {
    expect(resolveFirebaseEmulatorHost('web')).toBe('127.0.0.1');
  });

  it('mantem o modo mock desligado por padrao', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'fju-operational-emulator';

    const config = loadConfig();

    expect(config.USE_MOCK).toBe(false);
    expect(config.MOCK_DATA_ENABLED).toBe(false);
  });

  it('liga o modo mock apenas com EXPO_PUBLIC_USE_MOCK=true', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'fju-operational-emulator';
    process.env.EXPO_PUBLIC_USE_MOCK = 'true';

    const config = loadConfig();

    expect(config.USE_MOCK).toBe(true);
    expect(config.MOCK_DATA_ENABLED).toBe(true);
  });

  it('mantem autoatribuicao de organizador bloqueada por padrao', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'fju-operational-emulator';

    const config = loadConfig();

    expect(config.ALLOW_ORGANIZER_SELF_ASSIGN).toBe(false);
  });

  it('libera autoatribuicao de organizador somente por env explicita', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'development';
    process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'fju-operational-emulator';
    process.env.EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN = 'true';

    const config = loadConfig();

    expect(config.ALLOW_ORGANIZER_SELF_ASSIGN).toBe(true);
  });
});
