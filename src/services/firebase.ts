import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { connectAuthEmulator, initializeAuth, getAuth, browserLocalPersistence } from 'firebase/auth';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_CONFIG, FirebaseEmulatorService } from '../config/appConfig';

// getReactNativePersistence lives in Firebase's RN build, resolved by Metro at runtime.
// The TypeScript browser types don't include it, so we access it via require.
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => any;
};

type FirebaseEmulatorState = Partial<Record<FirebaseEmulatorService, boolean>>;

type FirebaseGlobal = typeof globalThis & {
  __FJU_FIREBASE_EMULATORS__?: FirebaseEmulatorState;
};

const firebaseConfig = APP_CONFIG.firebase;

export const isFirebaseConfigured = firebaseConfig.apiKey !== 'YOUR_API_KEY';

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
  const persistence = Platform.OS === 'web'
    ? browserLocalPersistence
    : getReactNativePersistence(AsyncStorage);
  initializeAuth(app, { persistence });
} else {
  app = getApp();
}

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

function getEmulatorState(): FirebaseEmulatorState {
  const firebaseGlobal = globalThis as FirebaseGlobal;
  firebaseGlobal.__FJU_FIREBASE_EMULATORS__ ??= {};
  return firebaseGlobal.__FJU_FIREBASE_EMULATORS__;
}

function connectFirebaseEmulatorsOnce() {
  if (!APP_CONFIG.firebaseEmulator.enabled) {
    return;
  }

  const { host, ports } = APP_CONFIG.firebaseEmulator;
  const state = getEmulatorState();

  if (!state.auth) {
    connectAuthEmulator(auth, `http://${host}:${ports.auth}`, { disableWarnings: true });
    state.auth = true;
  }

  if (!state.firestore) {
    connectFirestoreEmulator(db, host, ports.firestore);
    state.firestore = true;
  }

  if (!state.storage) {
    connectStorageEmulator(storage, host, ports.storage);
    state.storage = true;
  }
}

connectFirebaseEmulatorsOnce();
