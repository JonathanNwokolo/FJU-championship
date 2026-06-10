import { useEffect, useMemo, useState } from 'react';
import { getCollection, getDocument } from '../services/index';
import { ACHIEVEMENTS } from '../utils/achievementDefinitions';
import { calculateOverall } from '../utils/playerOverall';
import { isActiveRosterPlayer } from '../utils/teamRules';
import { useAchievementStore } from '../stores/achievementStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useMatchStore } from '../stores/matchStore';
import { useTeamStore } from '../stores/teamStore';
import {
  AchievementDefinition,
  AppUser,
  MatchEvent,
  Player,
  PlayerHistoryEntry,
  Team,
} from '../types';

type ChampionshipResultDoc = {
  championshipId: string;
  winnerId: string;
};

export interface AthleteProfileData {
  user: AppUser | null;
  player: Player | null;
  team: Team | null;
  activeChampionshipId: string | null;
  activeChampionshipName: string;
  goals: number;
  yellowCards: number;
  redCards: number;
  matchesPlayed: number;
  overall: number;
  history: PlayerHistoryEntry[];
  overallHistory: number[];
  achievements: AchievementDefinition[];
  achievementsUnlocked: number;
  totalAchievements: number;
  championByChampionshipId: Record<string, boolean>;
}

const EMPTY_DATA: AthleteProfileData = {
  user: null,
  player: null,
  team: null,
  activeChampionshipId: null,
  activeChampionshipName: '',
  goals: 0,
  yellowCards: 0,
  redCards: 0,
  matchesPlayed: 0,
  overall: 40,
  history: [],
  overallHistory: [],
  achievements: [],
  achievementsUnlocked: 0,
  totalAchievements: ACHIEVEMENTS.length,
  championByChampionshipId: {},
};

export function useAthleteProfile(userId?: string, championshipId?: string) {
  const championships = useChampionshipStore((s) => s.championships);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const matches = useMatchStore((s) => s.matches);
  const allAchievements = useAchievementStore((s) => s.achievements);

  const [data, setData] = useState<AthleteProfileData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);

  const activeChampionshipId = useMemo(() => {
    if (championshipId) return championshipId;
    return (
      championships.find((item) => item.status === 'em_andamento')?.id ??
      championships.find((item) => item.status === 'inscricoes_abertas')?.id ??
      championships[0]?.id ??
      null
    );
  }, [championshipId, championships]);

  useEffect(() => {
    let isMounted = true;

    async function fetchProfile() {
      if (!userId) {
        if (isMounted) {
          setData(EMPTY_DATA);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        // BE-01: /users agora é privado ao dono. Ler o doc de OUTRO usuário falha por
        // permissão — não é fatal: nome/foto exibidos têm fallback no player (coleção
        // pública). Para o próprio perfil a leitura continua permitida normalmente.
        let userDoc: AppUser | null = null;
        try {
          userDoc = await getDocument<AppUser>('users', userId);
        } catch {
          userDoc = null;
        }
        // Prefere o vínculo ATIVO: doc 'sem_time'/'removido' retém o teamId antigo
        // (rules impedem limpá-lo) e só serve de fallback para dados históricos.
        const storeCandidates = players.filter((item) => item.userId === userId);
        const playerCandidates =
          storeCandidates.length > 0
            ? storeCandidates
            : await getCollection<Player>('players', [
                { field: 'userId', operator: '==', value: userId },
              ]);
        const playerDoc =
          playerCandidates.find(isActiveRosterPlayer) ?? playerCandidates[0] ?? null;

        // Time atual só existe se o vínculo for ativo — quem saiu não tem time.
        const hasActiveLink = !!playerDoc && isActiveRosterPlayer(playerDoc);
        const teamDoc = hasActiveLink
          ? (teams.find((item) => item.id === playerDoc.teamId) ??
            (playerDoc.teamId ? await getDocument<Team>('teams', playerDoc.teamId) : null))
          : null;

        const eventsByUser = await getCollection<MatchEvent>('match_events', [
          { field: 'userId', operator: '==', value: userId },
        ]);
        const eventsByPlayer =
          playerDoc && eventsByUser.length === 0
            ? await getCollection<MatchEvent>('match_events', [
                { field: 'playerId', operator: '==', value: playerDoc.id },
              ])
            : [];
        const events = eventsByUser.length > 0 ? eventsByUser : eventsByPlayer;

        const history = await getCollection<PlayerHistoryEntry>('player_history', [
          { field: 'userId', operator: '==', value: userId },
        ]);
        const sortedHistory = [...history].sort((a, b) => {
          const aTime = new Date(a.finishedAt).getTime();
          const bTime = new Date(b.finishedAt).getTime();
          return bTime - aTime;
        });

        const teamChampionshipId = teamDoc?.championshipId ?? activeChampionshipId;
        const filteredEvents = events.filter((event) => {
          if (!teamChampionshipId) return true;
          const match = matches.find((item) => item.id === event.matchId);
          return match?.championshipId === teamChampionshipId;
        });

        const goals = filteredEvents.filter((event) => event.type === 'gol').length;
        const yellowCards = filteredEvents.filter((event) => event.type === 'cartao_amarelo').length;
        const redCards = filteredEvents.filter((event) => event.type === 'cartao_vermelho').length;
        const matchesPlayed = new Set(filteredEvents.map((event) => event.matchId)).size;
        const overall = calculateOverall(goals, yellowCards, redCards, matchesPlayed);

        const achievementScopeChampionshipId = teamChampionshipId ?? activeChampionshipId ?? '';
        const unlockedIds = new Set(
          allAchievements
            .filter((item) => item.playerId === playerDoc?.id && item.championshipId === achievementScopeChampionshipId)
            .map((item) => item.achievementId),
        );
        const achievements = ACHIEVEMENTS.filter((item) => unlockedIds.has(item.id));

        const championResults = await Promise.all(
          sortedHistory.slice(0, 8).map(async (entry) => {
            const result = await getDocument<ChampionshipResultDoc>('championship_results', entry.championshipId);
            return [entry.championshipId, result?.winnerId === entry.teamId] as const;
          }),
        );

        const championByChampionshipId = Object.fromEntries(championResults);
        const resolvedChampionshipName =
          championships.find((item) => item.id === (teamChampionshipId ?? activeChampionshipId))?.name ??
          sortedHistory[0]?.championshipName ??
          '';

        if (!isMounted) return;

        setData({
          user: userDoc,
          player: playerDoc,
          team: teamDoc,
          activeChampionshipId: teamChampionshipId ?? activeChampionshipId,
          activeChampionshipName: resolvedChampionshipName,
          goals,
          yellowCards,
          redCards,
          matchesPlayed,
          overall,
          history: sortedHistory,
          overallHistory: sortedHistory.slice(0, 5).map((entry) => entry.overall).reverse(),
          achievements,
          achievementsUnlocked: achievements.length,
          totalAchievements: ACHIEVEMENTS.length,
          championByChampionshipId,
        });
      } catch (error) {
        console.warn('[useAthleteProfile] Error loading profile:', error);
        if (isMounted) {
          setData(EMPTY_DATA);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchProfile();

    return () => {
      isMounted = false;
    };
  }, [activeChampionshipId, allAchievements.length, championships.length, matches.length, players.length, teams.length, userId]);

  return { ...data, loading };
}
