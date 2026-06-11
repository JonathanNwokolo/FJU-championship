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
  limit as limitConstraint,
  onSnapshot,
  serverTimestamp,
  QueryConstraint,
  WhereFilterOp,
} from 'firebase/firestore';
import { db } from './firebase';
import { MOCK_DATA_ENABLED as USE_MOCK_DATA } from '../config/appConfig';
import {
  addMockDocument,
  deleteMockDocument,
  getMockDocument,
  listMockDocuments,
  setMockDocument,
  subscribeToMockCollection,
  subscribeToMockDocument,
  updateMockDocument,
} from '../mocks/mockDb';

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
): Promise<string> {
  if (USE_MOCK_DATA) {
    return setMockDocument(collectionName, docId, data);
  }
  await setDoc(doc(db, collectionName, docId), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return docId;
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
  if (USE_MOCK_DATA) {
    setMockDocument(collectionName, docId, data);
    return;
  }
  await setDoc(doc(db, collectionName, docId), data, { merge: true });
}

export async function addDocument<T extends object>(
  collectionName: string,
  data: T
): Promise<string> {
  if (USE_MOCK_DATA) {
    return addMockDocument(collectionName, data);
  }
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
  if (USE_MOCK_DATA) {
    updateMockDocument(collectionName, docId, data);
    return;
  }
  await updateDoc(doc(db, collectionName, docId), data);
}

export async function deleteDocument(
  collectionName: string,
  docId: string
): Promise<void> {
  if (USE_MOCK_DATA) {
    deleteMockDocument(collectionName, docId);
    return;
  }
  await deleteDoc(doc(db, collectionName, docId));
}

export async function getDocument<T>(
  collectionName: string,
  docId: string
): Promise<T | null> {
  if (USE_MOCK_DATA) {
    return getMockDocument<T>(collectionName, docId);
  }
  const snap = await getDoc(doc(db, collectionName, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as T;
}

export async function getCollection<T>(
  collectionName: string,
  filters?: FirestoreFilter[]
): Promise<T[]> {
  if (USE_MOCK_DATA) {
    return listMockDocuments<T>(collectionName, filters ?? []);
  }
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
  limitCount?: number,
): () => void {
  if (USE_MOCK_DATA) {
    return subscribeToMockCollection<T>(
      collectionName,
      filters ?? [],
      callback,
      limitCount,
    );
  }
  const constraints: QueryConstraint[] = (filters ?? []).map((f) =>
    where(f.field, f.operator, f.value)
  );
  if (limitCount != null) {
    constraints.push(limitConstraint(limitCount));
  }
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
  if (USE_MOCK_DATA) {
    return subscribeToMockDocument<T>(collectionName, docId, callback);
  }
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
