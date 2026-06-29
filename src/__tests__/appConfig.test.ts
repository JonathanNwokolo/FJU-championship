describe('appConfig', () => {
  const originalEnv = process.env;

  function loadConfig(): typeof import('../config/appConfig') {
    let config: typeof import('../config/appConfig') | undefined;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      config = require('../config/appConfig');
    });
    return config!;
  }

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.EXPO_PUBLIC_USE_MOCK;
    delete process.env.EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN;
    delete process.env.JEST_WORKER_ID;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('mantem o modo mock desligado por padrao', () => {
    const config = loadConfig();

    expect(config.USE_MOCK).toBe(false);
    expect(config.MOCK_DATA_ENABLED).toBe(false);
  });

  it('liga o modo mock apenas com EXPO_PUBLIC_USE_MOCK=true', () => {
    process.env.EXPO_PUBLIC_USE_MOCK = 'true';

    const config = loadConfig();

    expect(config.USE_MOCK).toBe(true);
    expect(config.MOCK_DATA_ENABLED).toBe(true);
  });

  it('mantem autoatribuicao de organizador bloqueada por padrao', () => {
    const config = loadConfig();

    expect(config.ALLOW_ORGANIZER_SELF_ASSIGN).toBe(false);
  });

  it('libera autoatribuicao de organizador somente por env explicita', () => {
    process.env.EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN = 'true';

    const config = loadConfig();

    expect(config.ALLOW_ORGANIZER_SELF_ASSIGN).toBe(true);
  });
});
