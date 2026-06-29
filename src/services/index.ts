// =============================================================================
// Service barrel — exports Firebase Firestore services.
// All screens/hooks should import from here, NOT from ./firestore directly.
// =============================================================================
export type { FirestoreFilter } from './firestore';

export {
  setDocument,
  upsertDocument,
  addDocument,
  updateDocument,
  deleteDocument,
  getDocument,
  getCollection,
  subscribeToCollection,
  subscribeToDocument,
} from './firestore';

export { applyMatchCorrection } from './matchCorrectionService';
export type { MatchCorrectionContext, MatchCorrectionResult } from './matchCorrectionService';
