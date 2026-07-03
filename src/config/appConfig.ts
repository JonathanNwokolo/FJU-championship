import { Platform } from 'react-native';

export type AppEnvironment = 'development' | 'staging' | 'production';
export type FirebaseEmulatorService = 'auth' | 'firestore' | 'storage';

export interface PublicAppEnv {
  appEnv?: string;
  useFirebaseEmulator?: string;
  firebaseEmulatorHost?: string;
  firebaseProjectId?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  firebaseMeasurementId?: string;
  useMock?: string;
  allowOrganizerSelfAssign?: string;
  jestWorkerId?: string;
}

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

export interface FirebaseEmulatorConfig {
  enabled: boolean;
  host: string;
  ports: Record<FirebaseEmulatorService, number>;
}

export interface AppConfig {
  appEnv: AppEnvironment;
  isProduction: boolean;
  firebase: FirebaseClientConfig;
  firebaseEmulator: FirebaseEmulatorConfig;
}

const DEFAULT_PRODUCTION_PROJECT_ID = 'fju-championship';
const DEFAULT_DEVELOPMENT_PROJECT_ID = 'fju-operational-emulator';
const DEFAULT_STAGING_PROJECT_ID = 'fju-championship-staging';

const DEFAULT_FIREBASE = {
  apiKey: 'AIzaSyBJOcFPXVsaV6xOQWfdd2oX3hRopgszFZI',
  messagingSenderId: '867224860750',
  appId: '1:867224860750:web:878eae6df32d4a89e72b1f',
  measurementId: 'G-GVL1YB75KK',
};

export const FIREBASE_EMULATOR_PORTS: Record<FirebaseEmulatorService, number> = {
  auth: 9099,
  firestore: 8080,
  storage: 9199,
};

const ALLOWED_APP_ENVS: AppEnvironment[] = ['development', 'staging', 'production'];

function normalize(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parseAppEnv(value?: string): AppEnvironment {
  const normalized = normalize(value);
  if (!normalized || !ALLOWED_APP_ENVS.includes(normalized as AppEnvironment)) {
    throw new Error(
      `Configuracao invalida: EXPO_PUBLIC_APP_ENV deve ser development, staging ou production. Valor atual: ${normalized ?? 'ausente'}.`,
    );
  }
  return normalized as AppEnvironment;
}

function parseExplicitBoolean(name: string, value?: string): boolean {
  const normalized = normalize(value);
  if (normalized !== 'true' && normalized !== 'false') {
    throw new Error(`Configuracao invalida: ${name} deve ser explicitamente true ou false.`);
  }
  return normalized === 'true';
}

export function resolveFirebaseEmulatorHost(
  platformOS: typeof Platform.OS = Platform.OS,
  explicitHost?: string,
): string {
  const host = normalize(explicitHost);
  if (host) {
    return host.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  if (platformOS === 'android') {
    return '10.0.2.2';
  }

  return '127.0.0.1';
}

function defaultProjectIdForEnv(appEnv: AppEnvironment): string {
  if (appEnv === 'production') return DEFAULT_PRODUCTION_PROJECT_ID;
  if (appEnv === 'staging') return DEFAULT_STAGING_PROJECT_ID;
  return DEFAULT_DEVELOPMENT_PROJECT_ID;
}

function looksLikeProductionProject(projectId: string): boolean {
  const lower = projectId.toLowerCase();
  return lower === DEFAULT_PRODUCTION_PROJECT_ID || lower.includes('prod') || lower.includes('production');
}

export function createAppConfig(env: PublicAppEnv, platformOS: typeof Platform.OS = Platform.OS): AppConfig {
  const appEnv = parseAppEnv(env.appEnv);
  const useFirebaseEmulator = parseExplicitBoolean(
    'EXPO_PUBLIC_USE_FIREBASE_EMULATOR',
    env.useFirebaseEmulator,
  );
  const projectId = normalize(env.firebaseProjectId) ?? defaultProjectIdForEnv(appEnv);

  if (appEnv === 'production' && useFirebaseEmulator) {
    throw new Error('Configuracao invalida: production nunca pode usar Firebase Emulator.');
  }

  if (appEnv !== 'development' && useFirebaseEmulator) {
    throw new Error('Configuracao invalida: somente development pode usar Firebase Emulator.');
  }

  if (appEnv === 'development' && !useFirebaseEmulator && looksLikeProductionProject(projectId)) {
    throw new Error(
      `Configuracao insegura: development sem Emulator nao pode apontar para o projeto de producao "${projectId}".`,
    );
  }

  const authDomain = normalize(env.firebaseAuthDomain) ?? `${projectId}.firebaseapp.com`;
  const storageBucket = normalize(env.firebaseStorageBucket) ?? `${projectId}.firebasestorage.app`;

  return {
    appEnv,
    isProduction: appEnv === 'production',
    firebase: {
      apiKey: normalize(env.firebaseApiKey) ?? DEFAULT_FIREBASE.apiKey,
      authDomain,
      projectId,
      storageBucket,
      messagingSenderId: normalize(env.firebaseMessagingSenderId) ?? DEFAULT_FIREBASE.messagingSenderId,
      appId: normalize(env.firebaseAppId) ?? DEFAULT_FIREBASE.appId,
      measurementId: normalize(env.firebaseMeasurementId) ?? DEFAULT_FIREBASE.measurementId,
    },
    firebaseEmulator: {
      enabled: useFirebaseEmulator,
      host: resolveFirebaseEmulatorHost(platformOS, env.firebaseEmulatorHost),
      ports: FIREBASE_EMULATOR_PORTS,
    },
  };
}

export function readPublicAppEnv(): PublicAppEnv {
  return {
    appEnv: process.env.EXPO_PUBLIC_APP_ENV,
    useFirebaseEmulator: process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR,
    firebaseEmulatorHost: process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST,
    firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    firebaseApiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    firebaseAuthDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    firebaseStorageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    firebaseAppId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    firebaseMeasurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
    useMock: process.env.EXPO_PUBLIC_USE_MOCK,
    allowOrganizerSelfAssign: process.env.EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN,
    jestWorkerId: process.env.JEST_WORKER_ID,
  };
}

export const APP_CONFIG = createAppConfig(readPublicAppEnv());

// Demo/mock mode remains opt-in and separate from Firebase Emulator.
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';
export const MOCK_DATA_ENABLED = USE_MOCK && process.env.JEST_WORKER_ID == null;

export const ALLOW_ORGANIZER_SELF_ASSIGN =
  process.env.EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN === 'true';

export const MOCK_ACTIVE_USER:
  | 'organizador'
  | 'atleta'
  | 'capitao'
  | 'atleta_sem_time' = 'capitao';
