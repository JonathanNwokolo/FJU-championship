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
  const uid = auth.currentUser?.uid;
  if (uid) {
    await removeTokenFromFirestore(uid);
  }
  await firebaseSignOut(auth);
}

export async function saveRole(uid: string, role: UserRole): Promise<void> {
  await updateDocument('users', uid, { role });
}

export function listenToAuthChanges(
  callback: (result: { user: AppUser; isOnboarded: boolean } | null) => void
): () => void {
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
