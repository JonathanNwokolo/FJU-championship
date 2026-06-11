export const USE_MOCK_DATA = true;
// Sob Jest o modo mock fica desligado: os testes unitários mockam o Firebase
// diretamente e exercitam os caminhos reais dos services.
export const MOCK_DATA_ENABLED = USE_MOCK_DATA && process.env.JEST_WORKER_ID == null;

// Troque aqui o usuário logado da demo:
// 'organizador' | 'capitao' | 'atleta' | 'atleta_sem_time'
export const MOCK_ACTIVE_USER:
  | 'organizador'
  | 'capitao'
  | 'atleta'
  | 'atleta_sem_time' = 'organizador';
