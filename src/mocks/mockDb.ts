import { WhereFilterOp } from 'firebase/firestore';
import { mockCollections, mockUsers } from './mockData';
import { MOCK_ACTIVE_USER } from '../config/appConfig';
import { AppUser } from '../types';

type CollectionName = keyof typeof mockCollections | string;
type AnyDoc = Record<string, unknown> & { id: string };

export interface MockFilter {
  field: string;
  operator: WhereFilterOp;
  value: unknown;
}

const data = new Map<string, AnyDoc[]>(
  Object.entries(mockCollections).map(([key, value]) => [
    key,
    value.map((item) => ({ ...(item as AnyDoc) })),
  ]),
);

let nextId = 1;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectionDocs(collectionName: CollectionName): AnyDoc[] {
  const key = String(collectionName);
  if (!data.has(key)) data.set(key, []);
  return data.get(key)!;
}

function valueAt(doc: AnyDoc, field: string): unknown {
  return field.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, doc);
}

function matchesFilter(doc: AnyDoc, filter: MockFilter): boolean {
  const actual = valueAt(doc, filter.field);
  if (filter.operator === '==') return actual === filter.value;
  if (filter.operator === 'in') {
    return Array.isArray(filter.value) && filter.value.includes(actual);
  }
  if (filter.operator === 'array-contains') {
    return Array.isArray(actual) && actual.includes(filter.value);
  }
  return true;
}

export function getMockActiveUser(): AppUser {
  return clone(mockUsers[MOCK_ACTIVE_USER]);
}

export function listMockDocuments<T>(
  collectionName: CollectionName,
  filters: MockFilter[] = [],
  limitCount?: number,
): T[] {
  const docs = collectionDocs(collectionName)
    .filter((doc) => filters.every((filter) => matchesFilter(doc, filter)))
    .map(clone);
  return (limitCount != null ? docs.slice(0, limitCount) : docs) as T[];
}

export function getMockDocument<T>(collectionName: CollectionName, docId: string): T | null {
  const doc = collectionDocs(collectionName).find((item) => item.id === docId);
  return doc ? clone(doc as T) : null;
}

export function addMockDocument<T extends object>(
  collectionName: CollectionName,
  input: T,
): string {
  const docs = collectionDocs(collectionName);
  const candidate = input as Partial<AnyDoc>;
  const id = typeof candidate.id === 'string' && candidate.id.length > 0
    ? candidate.id
    : `mock-${String(collectionName).replace(/\W+/g, '-')}-${nextId++}`;
  const doc = {
    ...clone(input),
    id,
    createdAt: (candidate.createdAt as string | undefined) ?? new Date().toISOString(),
  } as AnyDoc;
  docs.push(doc);
  return id;
}

export function setMockDocument<T extends object>(
  collectionName: CollectionName,
  docId: string,
  input: T,
): string {
  const docs = collectionDocs(collectionName);
  const existingIndex = docs.findIndex((item) => item.id === docId);
  const current = existingIndex >= 0 ? docs[existingIndex] : {};
  const doc = {
    ...clone(current),
    ...clone(input),
    id: docId,
    createdAt:
      (input as Partial<AnyDoc>).createdAt ??
      (current as Partial<AnyDoc>).createdAt ??
      new Date().toISOString(),
  } as AnyDoc;
  if (existingIndex >= 0) docs[existingIndex] = doc;
  else docs.push(doc);
  return docId;
}

export function updateMockDocument(
  collectionName: CollectionName,
  docId: string,
  updates: Partial<Record<string, unknown>>,
): void {
  const docs = collectionDocs(collectionName);
  const existingIndex = docs.findIndex((item) => item.id === docId);
  if (existingIndex < 0) return;
  docs[existingIndex] = {
    ...docs[existingIndex],
    ...clone(updates),
  };
}

export function deleteMockDocument(collectionName: CollectionName, docId: string): void {
  const docs = collectionDocs(collectionName);
  const existingIndex = docs.findIndex((item) => item.id === docId);
  if (existingIndex >= 0) docs.splice(existingIndex, 1);
}

export function subscribeToMockCollection<T>(
  collectionName: CollectionName,
  filters: MockFilter[] = [],
  callback: (data: T[]) => void,
  limitCount?: number,
): () => void {
  callback(listMockDocuments<T>(collectionName, filters, limitCount));
  return () => {};
}

export function subscribeToMockDocument<T>(
  collectionName: CollectionName,
  docId: string,
  callback: (data: T | null) => void,
): () => void {
  callback(getMockDocument<T>(collectionName, docId));
  return () => {};
}
