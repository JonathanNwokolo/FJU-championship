import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Contexto ativo da dualidade Atleta/Capitão (BLOCO 4).
 *
 * Importante: NÃO reflete nem altera `user.role` no Firestore. É apenas uma
 * preferência de UI persistida localmente — um atleta que também é capitão de
 * algum time pode alternar entre "Modo Atleta" e "Modo Capitão" sem mudar role.
 * Segue o padrão de persistência já usado em votingStore (persist + AsyncStorage).
 */
export type ActiveContext = 'athlete' | 'captain';

interface ContextState {
  activeContext: ActiveContext;
  setActiveContext: (ctx: ActiveContext) => void;
  reset: () => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set) => ({
      activeContext: 'athlete',
      setActiveContext: (activeContext) => set({ activeContext }),
      reset: () => set({ activeContext: 'athlete' }),
    }),
    {
      name: 'fju-active-context',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
