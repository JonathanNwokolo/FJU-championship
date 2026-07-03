import type { Championship, MatchModel, Team } from '../types';
import { getCollection, getDocument } from './index';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { useMatchStore } from '../stores/matchStore';

/**
 * Bloco 10.4 — Fase 2. Re-hidrata campeonato, times e partidas a partir do
 * Firestore (fonte da verdade) após uma ação administrativa da fase de grupos.
 *
 * Evita a tela mostrar grupos/partidas antigos sem depender de reiniciar o app
 * (§13). Não cria listeners novos: é um fetch pontual sob demanda.
 */
export async function refreshGroupStageData(championshipId: string): Promise<void> {
  const [championship, teams, matches] = await Promise.all([
    getDocument<Championship>('championships', championshipId),
    getCollection<Team>('teams', [
      { field: 'championshipId', operator: '==', value: championshipId },
    ]),
    getCollection<MatchModel>('matches', [
      { field: 'championshipId', operator: '==', value: championshipId },
    ]),
  ]);

  if (championship) {
    useChampionshipStore.getState().updateChampionship(championshipId, championship);
  }

  const teamStore = useTeamStore.getState();
  const otherTeams = teamStore.teams.filter((team) => team.championshipId !== championshipId);
  teamStore.setTeams([...otherTeams, ...teams]);

  const matchStore = useMatchStore.getState();
  const otherMatches = matchStore.matches.filter((match) => match.championshipId !== championshipId);
  matchStore.setMatches([...otherMatches, ...matches]);
}
