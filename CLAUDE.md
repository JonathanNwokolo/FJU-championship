# FJU Championship — Contexto do projeto

## Stack
React Native + Expo (managed workflow) + TypeScript + Firebase JS SDK (Firestore, Auth, Storage) + Zustand + React Navigation + react-native-reanimated

## Design System

### Cores
primaryDark: #0D1B2A | primary: #1B2838 | accent: #F5A623 (dourado, COR ASSINATURA) | accentLight: #FFD700
success: #2ECC71 | danger: #E74C3C | warning: #F39C12
background: #FFFFFF | surface: #F5F5F5 | textPrimary: #1A1A1A | textSecondary: #6B6B6B | border: #E0E0E0

### Regra principal
Light base + Dark hero: telas gerais têm fundo branco. Headers hero, login, sorteio, card do atleta usam fundo primaryDark.

### Accent (#F5A623) só em
Botões primários, líder da classificação, badges importantes, tabs ativas, destaques de gol.

### Componentes
AppButton primary: fundo accent, texto #0D1B2A, height 50, radius 14, sombra dourada sutil
AppCard: fundo branco, radius 16, sombra leve (shadowOpacity 0.06), sem borda
AppTextField: fundo surface, radius 12, height 50, borda accent no focus
AppToggle: label esquerda, Switch direita, trackColor accent quando on

### Padrões de tela
- Classificação: estilo FotMob (tabela compacta, header dark, líder dourado, números tabulares)
- Confrontos: estilo OneFootball (cards limpos, placar central, cores dos times nas laterais)
- Detalhe partida: estilo SofaScore (hero dark com placar grande, timeline de eventos)
- Card atleta: estilo EA FC (gradiente escuro, borda dourada, overall grande)
- Sorteio: estilo esports (tela dark, animação dramática, partículas douradas)

### Fonte
Inter (Google Fonts via Expo)

## Estrutura de pastas
src/components, screens, types, stores, services, data, theme, utils, navigation

## Modelo de dados (Firestore)

### players
{ id, name, position, shirtNumber, photoUrl, teamId, championshipId, userId }

### match_events
{ id, matchId, championshipId, type, playerId, teamId, minute }

### matches
{ id, championshipId, round, homeTeamId, awayTeamId, homeScore, awayScore, status }

### teams
{ id, name, primaryColor, secondaryColor, captainId, championshipId }

### championships
{ id, name, format, status, rules }

### round_awards
{ id, championshipId, round, winnerPlayerId, winnerName, winnerTeamId, totalVotes }
