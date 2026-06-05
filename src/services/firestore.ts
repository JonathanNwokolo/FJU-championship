import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  QueryConstraint,
  WhereFilterOp,
} from 'firebase/firestore';
import { db } from './firebase';

export interface FirestoreFilter {
  field: string;
  operator: WhereFilterOp;
  value: unknown;
}

/**
 * Cria ou SUBSTITUI um documento adicionando createdAt.
 * Use apenas para criação inicial de documentos.
 */
export async function setDocument<T extends object>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  await setDoc(doc(db, collectionName, docId), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

/**
 * Atualiza (upsert) um documento sem sobrescrever createdAt existente.
 * Use para updates de documentos já existentes.
 */
export async function upsertDocument<T extends object>(
  collectionName: string,
  docId: string,
  data: T
): Promise<void> {
  await setDoc(doc(db, collectionName, docId), data, { merge: true });
}

export async function addDocument<T extends object>(
  collectionName: string,
  data: T
): Promise<string> {
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateDocument(
  collectionName: string,
  docId: string,
  data: Partial<Record<string, unknown>>
): Promise<void> {
  await updateDoc(doc(db, collectionName, docId), data);
}

export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  await deleteDoc(doc(db, collectionName, docId));
}

export async function getDocument<T>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  const snap = await getDoc(doc(db, collectionName, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as T;
}

export async function getCollection<T>(
  collectionName: string,
  filters?: FirestoreFilter[]
): Promise<T[]> {
  const constraints: QueryConstraint[] = (filters ?? []).map((f) =>
    where(f.field, f.operator, f.value)
  );
  const q = query(collection(db, collectionName), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T);
}

export function subscribeToCollection<T>(
  collectionName: string,
  filters: FirestoreFilter[] | undefined,
  callback: (data: T[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const constraints: QueryConstraint[] = (filters ?? []).map((f) =>
    where(f.field, f.operator, f.value)
  );
  const q = query(collection(db, collectionName), ...constraints);
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T));
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.warn(`[firestore] subscribeToCollection(${collectionName}) error:`, error.message);
      }
    },
  );
}

export function subscribeToDocument<T>(
  collectionName: string,
  docId: string,
  callback: (data: T | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, collectionName, docId),
    (snap) => {
      if (!snap.exists()) {
        callback(null);
      } else {
        callback({ id: snap.id, ...snap.data() } as T);
      }
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.warn(`[firestore] subscribeToDocument(${collectionName}/${docId}) error:`, error.message);
      }
    },
  );
}
