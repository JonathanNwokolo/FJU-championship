describe('firebase emulator initialization', () => {
  const app = { name: 'fju-app' };
  const auth = {};
  const db = {};
  const storage = {};

  let initializeApp: jest.Mock;
  let getApps: jest.Mock;
  let getApp: jest.Mock;
  let initializeAuth: jest.Mock;
  let getAuth: jest.Mock;
  let connectAuthEmulator: jest.Mock;
  let getFirestore: jest.Mock;
  let connectFirestoreEmulator: jest.Mock;
  let getStorage: jest.Mock;
  let connectStorageEmulator: jest.Mock;

  function installMocks(enabled: boolean) {
    jest.resetModules();
    delete (globalThis as { __FJU_FIREBASE_EMULATORS__?: unknown }).__FJU_FIREBASE_EMULATORS__;

    initializeApp = jest.fn(() => app);
    getApps = jest.fn(() => []);
    getApp = jest.fn(() => app);
    initializeAuth = jest.fn();
    getAuth = jest.fn(() => auth);
    connectAuthEmulator = jest.fn();
    getFirestore = jest.fn(() => db);
    connectFirestoreEmulator = jest.fn();
    getStorage = jest.fn(() => storage);
    connectStorageEmulator = jest.fn();

    jest.doMock('firebase/app', () => ({
      initializeApp,
      getApps,
      getApp,
    }));
    jest.doMock('firebase/auth', () => ({
      browserLocalPersistence: {},
      connectAuthEmulator,
      getAuth,
      getReactNativePersistence: jest.fn(() => ({})),
      initializeAuth,
    }));
    jest.doMock('firebase/firestore', () => ({
      connectFirestoreEmulator,
      getFirestore,
    }));
    jest.doMock('firebase/storage', () => ({
      connectStorageEmulator,
      getStorage,
    }));
    jest.doMock('../config/appConfig', () => ({
      APP_CONFIG: {
        firebase: {
          apiKey: 'key',
          authDomain: 'fju-operational-emulator.firebaseapp.com',
          projectId: 'fju-operational-emulator',
          storageBucket: 'fju-operational-emulator.firebasestorage.app',
          messagingSenderId: 'sender',
          appId: 'app',
        },
        firebaseEmulator: {
          enabled,
          host: '10.0.2.2',
          ports: { auth: 9099, firestore: 8080, storage: 9199 },
        },
      },
    }));
  }

  it('conecta Auth, Firestore e Storage Emulator uma vez', () => {
    installMocks(true);

    jest.requireActual('../services/firebase');

    expect(connectAuthEmulator).toHaveBeenCalledWith(auth, 'http://10.0.2.2:9099', {
      disableWarnings: true,
    });
    expect(connectFirestoreEmulator).toHaveBeenCalledWith(db, '10.0.2.2', 8080);
    expect(connectStorageEmulator).toHaveBeenCalledWith(storage, '10.0.2.2', 9199);
  });

  it('nao reconecta durante hot reload/reavaliacao do modulo', () => {
    installMocks(true);

    jest.requireActual('../services/firebase');
    jest.resetModules();
    jest.requireActual('../services/firebase');

    expect(connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(connectFirestoreEmulator).toHaveBeenCalledTimes(1);
    expect(connectStorageEmulator).toHaveBeenCalledTimes(1);
  });

  it('nao conecta em producao/emulator desligado', () => {
    installMocks(false);

    jest.requireActual('../services/firebase');

    expect(connectAuthEmulator).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
    expect(connectStorageEmulator).not.toHaveBeenCalled();
  });
});
