import { useMemo } from 'react';
import { useMatchStore } from '../stores/matchStore';
import { useTeamStore } from '../stores/teamStore';
import { useChampionshipStore } from '../stores/championshipStore';
import {
  calculateStandings,
  calculateTopScorers,
  calculatePlayerDisciplineRanking,
  calculateBestAttack,
  calculateBestDefense,
  calculateRoundMVP,
  getSuspendedPlayers,
} from '../services/statsService';
import { isActiveRosterPlayer } from '../utils/teamRules';
import { ChampionshipRules } from '../types';

const DEFAULT_RULES: ChampionshipRules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['saldo_gols', 'gols_pro', 'confronto_direto', 'fair_play'],
  fairPlay: true,
  craqueDaRodada: true,
  yellowCardLimit: 3,
};

export function useStats(championshipId: string) {
  const { matches, events } = useMatchStore();
  const { teams, players } = useTeamStore();
  const championships = useChampionshipStore((s) => s.championships);

  const championship = championships.find((c) => c.id === championshipId);
  const rules = championship?.rules ?? DEFAULT_RULES;
  const currentRound = championship?.currentRound ?? 1;
  const championshipName = championship?.name ?? '';

  const champMatches = useMemo(
    () => matches.filter((m) => m.championshipId === championshipId),
    [matches, championshipId],
  );

  const champTeams = useMemo(
    () => teams.filter((t) => t.championshipId === championshipId),
    [teams, championshipId],
  );

  // P-12: a classificação só deve conter times APROVADOS. Times pendentes/rejeitados
  // não jogam (0 partidas) e apareciam como linhas zeradas no fim da tabela.
  const standingsTeams = useMemo(
    () => champTeams.filter((t) => t.status === 'aprovado'),
    [champTeams],
  );

  // HISTÓRICO: inclui sem_time/removido (teamId preservado no doc) para não
  // apagar artilharia/disciplina de quem já pontuou e depois saiu.
  const champPlayers = useMemo(
    () => players.filter((p) => champTeams.some((t) => t.id === p.teamId)),
    [players, champTeams],
  );

  // ELENCO ATUAL: apenas vínculos ativos (suspensões, escalações etc.).
  const activeChampPlayers = useMemo(
    () => champPlayers.filter(isActiveRosterPlayer),
    [champPlayers],
  );

  const champPlayersForDiscipline = useMemo(
    () =>
      players.filter(
        (p) => p.championshipId === championshipId || champTeams.some((t) => t.id === p.teamId),
      ),
    [players, championshipId, champTeams],
  );

  const champEvents = useMemo(
    () => events.filter((e) => e.championshipId === championshipId),
    [events, championshipId],
  );

  const standings = useMemo(
    () => calculateStandings(champMatches, events, standingsTeams, rules),
    [champMatches, events, standingsTeams, rules],
  );

  const topScorers = useMemo(
    () => calculateTopScorers(champEvents, champPlayers, champTeams),
    [champEvents, champPlayers, champTeams],
  );

  const disciplineRanking = useMemo(
    () => calculatePlayerDisciplineRanking(champEvents, champPlayersForDiscipline, champTeams),
    [champEvents, champPlayersForDiscipline, champTeams],
  );

  const bestAttack = useMemo(() => calculateBestAttack(standings), [standings]);

  const bestDefense = useMemo(() => calculateBestDefense(standings), [standings]);

  const roundMVP = useMemo(
    () => calculateRoundMVP(champMatches, events, champTeams, currentRound, rules),
    [champMatches, events, champTeams, currentRound, rules],
  );

  const suspendedPlayers = useMemo(
    () => getSuspendedPlayers(champMatches, events, activeChampPlayers, champTeams, rules),
    [champMatches, events, activeChampPlayers, champTeams, rules],
  );

  const totalGoals = useMemo(() => {
    const ids = new Set(champMatches.map((m) => m.id));
    return events.filter((e) => e.type === 'gol' && ids.has(e.matchId)).length;
  }, [champMatches, events]);

  const finishedCount = useMemo(
    () => champMatches.filter((m) => m.status === 'finalizado').length,
    [champMatches],
  );

  return {
    standings,
    topScorers,
    disciplineRanking,
    bestAttack,
    bestDefense,
    roundMVP,
    suspendedPlayers,
    championshipName,
    totalGoals,
    finishedCount,
    currentRound,
  };
}
