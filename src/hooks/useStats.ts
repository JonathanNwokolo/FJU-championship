import { useMemo } from 'react';
import { useMatchStore } from '../stores/matchStore';
import { useTeamStore } from '../stores/teamStore';
import { useChampionshipStore } from '../stores/championshipStore';
import {
  calculateStandings,
  calculateTopScorers,
  calculateBestAttack,
  calculateBestDefense,
  calculateRoundMVP,
  getSuspendedPlayers,
} from '../services/statsService';
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

  const champPlayers = useMemo(
    () => players.filter((p) => champTeams.some((t) => t.id === p.teamId)),
    [players, champTeams],
  );

  const standings = useMemo(
    () => calculateStandings(champMatches, events, champTeams, rules),
    [champMatches, events, champTeams, rules],
  );

  const topScorers = useMemo(
    () => calculateTopScorers(events, champPlayers, champTeams),
    [events, champPlayers, champTeams],
  );

  const bestAttack = useMemo(() => calculateBestAttack(standings), [standings]);

  const bestDefense = useMemo(() => calculateBestDefense(standings), [standings]);

  const roundMVP = useMemo(
    () => calculateRoundMVP(champMatches, events, champTeams, currentRound, rules),
    [champMatches, events, champTeams, currentRound, rules],
  );

  const suspendedPlayers = useMemo(
    () => getSuspendedPlayers(champMatches, events, champPlayers, champTeams, rules),
    [champMatches, events, champPlayers, champTeams, rules],
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
