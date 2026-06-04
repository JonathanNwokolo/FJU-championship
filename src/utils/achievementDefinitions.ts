import { AchievementDefinition } from '../types';

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Gols
  {
    id: 'primeiro_gol',
    name: 'Primeiro Sangue',
    description: 'Marcou o primeiro gol do campeonato',
    icon: '🥇',
    rarity: 'comum',
    rarityColor: '#CD7F32',
  },
  {
    id: 'hat_trick',
    name: 'Hat-trick',
    description: 'Marcou 3 gols em uma partida',
    icon: '⚽',
    rarity: 'raro',
    rarityColor: '#C0C0C0',
  },
  {
    id: 'artilheiro_rodada',
    name: 'Artilheiro da Rodada',
    description: 'Mais gols em uma rodada',
    icon: '🏹',
    rarity: 'raro',
    rarityColor: '#C0C0C0',
  },
  {
    id: 'artilheiro_campeonato',
    name: 'Rei dos Gols',
    description: 'Artilheiro do campeonato',
    icon: '👑',
    rarity: 'epico',
    rarityColor: '#F5A623',
  },
  {
    id: 'cinco_gols',
    name: 'Em Chamas',
    description: '5 ou mais gols no campeonato',
    icon: '🔥',
    rarity: 'raro',
    rarityColor: '#C0C0C0',
  },
  {
    id: 'dez_gols',
    name: 'Sniper',
    description: '10 ou mais gols no campeonato',
    icon: '💎',
    rarity: 'epico',
    rarityColor: '#F5A623',
  },
  {
    id: 'gol_decisivo',
    name: 'Decisivo',
    description: 'Marcou o gol da vitória (gol que fez diferença)',
    icon: '⚡',
    rarity: 'raro',
    rarityColor: '#C0C0C0',
  },

  // Fair Play
  {
    id: 'fair_play_rodada',
    name: 'Cavalheiro',
    description: 'Rodada inteira sem cartões (com partidas jogadas)',
    icon: '🕊️',
    rarity: 'comum',
    rarityColor: '#CD7F32',
  },
  {
    id: 'fair_play_campeonato',
    name: 'Espírito Esportivo',
    description: 'Campeonato inteiro sem nenhum cartão',
    icon: '🏅',
    rarity: 'epico',
    rarityColor: '#F5A623',
  },

  // Defesa
  {
    id: 'clean_sheet',
    name: 'Muralha',
    description: 'Partida sem sofrer gols',
    icon: '🧤',
    rarity: 'raro',
    rarityColor: '#C0C0C0',
  },
  {
    id: 'tres_clean_sheets',
    name: 'Fortaleza',
    description: '3 clean sheets no campeonato',
    icon: '🛡️',
    rarity: 'epico',
    rarityColor: '#F5A623',
  },

  // Time
  {
    id: 'invicto_rodada',
    name: 'Invicto',
    description: 'Time passou uma rodada sem perder',
    icon: '💪',
    rarity: 'comum',
    rarityColor: '#CD7F32',
  },
  {
    id: 'virada',
    name: 'De Trás pra Frente',
    description: 'Time estava perdendo e virou o jogo',
    icon: '🔄',
    rarity: 'raro',
    rarityColor: '#C0C0C0',
  },

  // Especiais FJU
  {
    id: 'craque_rodada',
    name: 'Craque da Rodada',
    description: 'Venceu a votação de craque',
    icon: '🌟',
    rarity: 'lendario',
    rarityColor: '#FFD700',
  },
  {
    id: 'participacao',
    name: 'Guerreiro',
    description: 'Jogou em pelo menos 5 partidas do campeonato',
    icon: '🎖️',
    rarity: 'comum',
    rarityColor: '#CD7F32',
  },
];

export const RARITY_ORDER: Record<string, number> = {
  lendario: 0,
  epico: 1,
  raro: 2,
  comum: 3,
};

export function getAchievementDef(id: string): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
