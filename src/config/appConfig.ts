export const USE_MOCK_DATA = true;
export const MOCK_DATA_ENABLED = USE_MOCK_DATA && process.env.JEST_WORKER_ID == null;

export const MOCK_ACTIVE_USER:
  | 'organizador'
  | 'capitao'
  | 'atleta'
  | 'atleta_sem_time' = 'organizador';
