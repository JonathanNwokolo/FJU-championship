import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { auth } from './firebase';
import { setDocument, getDocument, updateDocument } from './firestore';
import { removeTokenFromFirestore } from './notificationService';
import { AppUser, UserRole } from '../types';
import { MOCK_DATA_ENABLED as USE_MOCK_DATA } from '../config/appConfig';
import { getMockActiveUser, setMockDocument, updateMockDocument } from '../mocks/mockDb';
import { seedMockStores } from '../mocks/seedMockState';

interface FirestoreUser {
  id: string;
  name: string;
  email: string;
  role?: UserRole;
  photoUrl?: string;
}

export async function signUp(
  email: string,
  password: string,
  name: string
): Promise<AppUser> {
  if (USE_MOCK_DATA) {
    const user: AppUser = {
      id: `mock-user-${Date.now()}`,
      name,
      email,
      role: 'atleta',
      photoUrl: 'https://placehold.co/160x160/111827/F5A623?text=FJU',
    };
    setMockDocument('users', user.id, user);
    return user;
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const { uid } = credential.user;

  await updateProfile(credential.user, { displayName: name });

  await setDocument<Omit<FirestoreUser, 'id'>>('users', uid, { name, email });

  return { id: uid, name, email, role: 'atleta' };
}

export async function signIn(
  email: string,
  password: string
): Promise<{ user: AppUser; isOnboarded: boolean }> {
  if (USE_MOCK_DATA) {
    seedMockStores();
    const user = getMockActiveUser();
    return { user: { ...user, email: user.email ?? email }, isOnboarded: true };
  }

  const credential = await signInWithEmailAndPassword(auth, email, password);
  const { uid } = credential.user;

  const doc = await getDocument<FirestoreUser>('users', uid);
  const name = doc?.name ?? credential.user.displayName ?? email.split('@')[0];
  const role = doc?.role;

  return {
    user: { id: uid, name, email, role: role ?? 'atleta', photoUrl: doc?.photoUrl },
    isOnboarded: !!role,
  };
}

export async function signOut(): Promise<void> {
  if (USE_MOCK_DATA) {
    return;
  }

  const uid = auth.currentUser?.uid;
  if (uid) {
    await removeTokenFromFirestore(uid);
  }
  await firebaseSignOut(auth);
}

export async function saveRole(uid: string, role: UserRole): Promise<void> {
  if (USE_MOCK_DATA) {
    updateMockDocument('users', uid, { role });
    return;
  }
  await updateDocument('users', uid, { role });
}

export function listenToAuthChanges(
  callback: (result: { user: AppUser; isOnboarded: boolean } | null) => void
): () => void {
  if (USE_MOCK_DATA) {
    seedMockStores();
    callback({ user: getMockActiveUser(), isOnboarded: true });
    return () => {};
  }

  return onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      callback(null);
      return;
    }

    const doc = await getDocument<FirestoreUser>('users', firebaseUser.uid);
    const name = doc?.name ?? firebaseUser.displayName ?? firebaseUser.email?.split('@')[0] ?? 'Usuário';
    const role = doc?.role;

    callback({
      user: {
        id: firebaseUser.uid,
        name,
        email: firebaseUser.email ?? '',
        role: role ?? 'atleta',
        photoUrl: doc?.photoUrl,
      },
      isOnboarded: !!role,
    });
  });
}
