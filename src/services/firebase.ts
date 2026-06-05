import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAuth, getAuth, browserLocalPersistence } from 'firebase/auth';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// getReactNativePersistence lives in Firebase's RN build, resolved by Metro at runtime.
// The TypeScript browser types don't include it, so we access it via require.
const { getReactNativePersistence } = require('firebase/auth') as {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getReactNativePersistence: (storage: typeof AsyncStorage) => any;
};

const firebaseConfig = {
  apiKey: "AIzaSyBJOcFPXVsaV6xOQWfdd2oX3hRopgszFZI",
  authDomain: "fju-championship.firebaseapp.com",
  projectId: "fju-championship",
  storageBucket: "fju-championship.firebasestorage.app",
  messagingSenderId: "867224860750",
  appId: "1:867224860750:web:878eae6df32d4a89e72b1f",
  measurementId: "G-GVL1YB75KK"
};

export const isFirebaseConfigured = firebaseConfig.apiKey !== 'YOUR_API_KEY';

let app;
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
