// O modo mock deve ser opt-in. Builds reais não podem entrar em demo por omissão.
// Use EXPO_PUBLIC_USE_MOCK=true apenas em desenvolvimento/demonstração.
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === 'true';
// Sob Jest o modo mock fica desligado: os testes unitários mockam o Firebase
// diretamente e exercitam os caminhos reais dos services.
export const MOCK_DATA_ENABLED = USE_MOCK && process.env.JEST_WORKER_ID == null;

// Papel organizador não deve ser autoatribuído em produção. Para uma demo local
// controlada, habilite explicitamente EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN=true.
export const ALLOW_ORGANIZER_SELF_ASSIGN =
  process.env.EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN === 'true';

// Troque aqui o usuário logado da demo:
// 'organizador' | 'capitao' | 'atleta' | 'atleta_sem_time'
export const MOCK_ACTIVE_USER:
  | 'organizador'
  | 'atleta'
  | 'capitao'
  | 'atleta_sem_time' = 'capitao';
