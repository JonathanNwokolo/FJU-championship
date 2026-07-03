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

export {
  applyMatchCorrection,
  applyMatchCorrectionWithClosedChampionshipReprocess,
  CorrectionError,
  getCorrectionErrorMessage,
} from './matchCorrectionService';
export type {
  IntegratedMatchCorrectionContext,
  MatchCorrectionContext,
  MatchCorrectionResult,
  MatchCorrectionReprocessSummary,
  CorrectionErrorCode,
} from './matchCorrectionService';

export {
  applyWalkover,
  applyPostpone,
  applyCancel,
  applyReactivate,
  MatchStatusError,
  getMatchStatusErrorMessage,
} from './matchStatusService';
export type {
  WalkoverContext,
  PostponeContext,
  CancelContext,
  ReactivateContext,
  MatchStatusResult,
  MatchStatusErrorCode,
} from './matchStatusService';

export {
  saveConvocation,
  closeConvocation,
  applyConvocationStatusEffect,
  ConvocationError,
  getConvocationErrorMessage,
} from './convocationService';
export type {
  SaveConvocationContext,
  CloseConvocationContext,
  ConvocationResult,
  ConvocationErrorCode,
} from './convocationService';

export {
  respondAttendance,
  markAttendancesForReconfirmation,
  getMatchAttendances,
  getConvocationFor,
  AttendanceError,
  getAttendanceErrorMessage,
} from './attendanceService';

export {
  createGroupDrawSeed,
  previewGroupAssignments,
  generateAndPersistGroupAssignments,
  generateAndPersistGroupFixtures,
  completeGroupStageAndGenerateKnockout,
  getGroupAssignmentLogId,
  getGroupFixturesLogId,
  getGroupTransitionLogId,
  requestGroupRedraw,
  GroupAssignmentError,
  GroupFixturesError,
  GroupStageTransitionError,
} from './groupStageService';
export type {
  PreviewGroupAssignmentsInput,
  GenerateGroupAssignmentsInput,
  GenerateGroupAssignmentsResult,
  GenerateGroupFixturesInput,
  GenerateGroupFixturesResult,
  CompleteGroupStageInput,
  CompleteGroupStageResult,
} from './groupStageService';
export type {
  RespondAttendanceContext,
  AttendanceResult,
  AttendanceErrorCode,
} from './attendanceService';
