import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { initializeAuth, getAuth,  } from 'firebase/auth';
import { getReactNativePersistence } from 'firebase/auth/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
  initializeAuth(app, { persistence: (AsyncStorage) });
} else {
  app = getApp();
}

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
