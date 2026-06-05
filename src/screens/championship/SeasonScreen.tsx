import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  FlatList,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { AppCard } from '../../components/AppCard';
import { PodiumCard } from '../../components/PodiumCard';
import { SectionHeader } from '../../components/SectionHeader';
import { TeamColorDot } from '../../components/TeamColorDot';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { colors, shadows } from '../../theme/colors';
import { getDocument } from '../../services/firestore';
import { calculateStandings } from '../../services/statsService';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { ChampionshipResultData, Player } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type RouteT = RouteProp<HomeStackParamList, 'Season'>;
type NavProp = NativeStackNavigationProp<HomeStackParamList, 'Season'>;

function ordinalEdition(n?: number): string {
  if (!n) return '1ª';
  return `${n}ª`;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

interface HighlightRowProps {
  badge: string;
  photoUrl?: string;
  teamColor?: string;
  name: string;
  stat: string;
  label: string;
}

function HighlightRow({ badge, photoUrl, teamColor, name, stat, label }: HighlightRowProps) {
  return (
    <View style={styles.highlightRow}>
      <View style={styles.highlightAvatar}>
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.highlightAvatarImg} />
        ) : teamColor ? (
          <View style={[styles.highlightAvatarPlaceholder, { backgroundColor: teamColor }]}>
            <Text style={styles.highlightAvatarInitials}>{getInitials(name)}</Text>
          </View>
        ) : (
          <View style={styles.highlightAvatarPlaceholder}>
            <Text style={styles.highlightAvatarInitials}>{getInitials(name)}</Text>
          </View>
        )}
      </View>
      <View style={styles.highlightInfo}>
        <Text style={styles.highlightName} numberOfLines={1}>{name}</Text>
        <Text style={styles.highlightStat}>{stat}</Text>
      </View>
      <View style={styles.highlightBadge}>
        <Text style={styles.highlightBadgeText}>{badge}</Text>
      </View>
    </View>
  );
}

interface PlayerRowProps {
  player: Player;
  teamName: string;
  goals: number;
  onPress: () => void;
}

function PlayerRow({ player, teamName, goals, onPress }: PlayerRowProps) {
  return (
    <TouchableOpacity style={styles.playerRow} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.playerAvatar}>
        {player.photoUrl ? (
          <Image source={{ uri: player.photoUrl }} style={styles.playerAvatarImg} />
        ) : (
          <View style={styles.playerAvatarPlaceholder}>
            <Text style={styles.playerAvatarInitials}>{getInitials(player.name)}</Text>
          </View>
        )}
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
        <Text style={styles.playerTeam} numberOfLines={1}>{teamName}</Text>
      </View>
      {goals > 0 && (
        <View style={styles.playerGoals}>
          <Text style={styles.playerGoalsValue}>{goals}</Text>
          <Text style={styles.playerGoalsLabel}>⚽</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function SeasonScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;

  const championships = useChampionshipStore((s) => s.championships);
  const { teams, players } = useTeamStore();
  const matches = useMatchStore((s) => s.matches);
  const events = useMatchStore((s) => s.events);

  const [result, setResult] = useState<ChampionshipResultData | null>(null);
  const [loading, setLoading] = useState(true);

  const championship = championships.find((c) => c.id === championshipId);
  const champTeams = useMemo(
    () => teams.filter((t) => t.championshipId === championshipId),
    [teams, championshipId],
  );
  const champMatches = useMemo(
    () => matches.filter((m) => m.championshipId === championshipId),
    [matches, championshipId],
  );
  const champEvents = useMemo(
    () => events.filter((e) => champMatches.some((m) => m.id === e.matchId)),
    [events, champMatches],
  );
  const champPlayers = useMemo(
    () => players.filter((p) => champTeams.some((t) => t.id === p.teamId)),
    [players, champTeams],
  );

  const standings = useMemo(
    () =>
      championship
        ? calculateStandings(champMatches, champEvents, champTeams, championship.rules)
        : [],
    [championship, champMatches, champEvents, champTeams],
  );

  const goalsByPlayer = useMemo(() => {
    const map: Record<string, number> = {};
    for (const e of champEvents) {
      if (e.type === 'gol') {
        map[e.playerId] = (map[e.playerId] ?? 0) + 1;
      }
    }
    return map;
  }, [champEvents]);

  const redCardCount = useMemo(
    () => champEvents.filter((e) => e.type === 'cartao_vermelho').length,
    [champEvents],
  );

  const sortedPlayers = useMemo(
    () =>
      [...champPlayers].sort((a, b) => (goalsByPlayer[b.id] ?? 0) - (goalsByPlayer[a.id] ?? 0)),
    [champPlayers, goalsByPlayer],
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await getDocument<ChampionshipResultData>(
          'championship_results',
          championshipId,
        );
        setResult(data);
      } catch (e) {
        console.warn('[SeasonScreen] fetch error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [championshipId]);

  const winnerTeam = champTeams.find((t) => t.id === result?.winnerId);
  const captainPlayer = winnerTeam
    ? champPlayers.find((p) => p.userId === winnerTeam.captainId)
    : undefined;
  const topScorerPlayer = champPlayers.find((p) => p.id === result?.topScorerId);
  const mvpPlayer = champPlayers.find((p) => p.id === result?.mvpPlayerId);
  const fairPlayTeam = champTeams.find((t) => t.id === result?.fairPlayTeamId);
  const bestDefenseTeam = champTeams.find((t) => t.id === result?.bestDefenseId);

  const seasonYear =
    championship?.season ??
    (championship?.createdAt
      ? new Date(championship.createdAt).getFullYear().toString()
      : new Date().getFullYear().toString());
  const editionLabel = ordinalEdition(championship?.edition);

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.navBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>
        </View>
        <View style={styles.skeletonWrap}>
          <SkeletonLoader width="100%" height={200} borderRadius={0} />
          <View style={{ padding: 16, gap: 12 }}>
            <SkeletonLoader width="100%" height={100} borderRadius={16} />
            <SkeletonLoader width="100%" height={120} borderRadius={16} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── HERO ── */}
        <LinearGradient
          colors={[colors.bg300, colors.bg100]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.hero}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>

          <Ionicons
            name="trophy"
            size={140}
            color={colors.accent}
            style={styles.heroTrophyBg}
          />

          <Text style={styles.heroMicro}>TEMPORADA</Text>
          <Text style={styles.heroYear}>{seasonYear}</Text>
          <Text style={styles.heroCaption}>
            {editionLabel} Edição · {championship?.name ?? 'FJU Championship'}
          </Text>
        </LinearGradient>

        <View style={styles.body}>

          {/* ── CAMPEÃO ── */}
          {winnerTeam && (
            <LinearGradient
              colors={[colors.accent, colors.accentDim]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.championCard}
            >
              <Text style={styles.championMicro}>🏆 CAMPEÃO DA TEMPORADA</Text>
              <View style={styles.championRow}>
                <TeamColorDot color={winnerTeam.primaryColor} size={20} />
                <Text style={styles.championName} numberOfLines={1}>{winnerTeam.name}</Text>
              </View>
              {captainPlayer && (
                <Text style={styles.championCap}>
                  Cap. {captainPlayer.name}
                </Text>
              )}
            </LinearGradient>
          )}

          {/* ── PÓDIO ── */}
          {standings.length >= 3 && (
            <View style={styles.section}>
              <SectionHeader title="PÓDIO" />
              <View style={styles.podiumRow}>
                <PodiumCard standing={standings[1]} place={2} />
                <PodiumCard standing={standings[0]} place={1} />
                <PodiumCard standing={standings[2]} place={3} />
              </View>
            </View>
          )}

          {/* ── NÚMEROS DA TEMPORADA ── */}
          <View style={styles.section}>
            <SectionHeader title="NÚMEROS DA TEMPORADA" />
            <View style={styles.statsGrid}>
              <AppCard style={styles.statCard}>
                <Text style={styles.statIcon}>⚽</Text>
                <Text style={styles.statValue}>{result?.totalGoals ?? 0}</Text>
                <Text style={styles.statLabel}>Gols marcados</Text>
              </AppCard>
              <AppCard style={styles.statCard}>
                <Text style={styles.statIcon}>🏟️</Text>
                <Text style={styles.statValue}>{result?.totalMatches ?? champMatches.filter((m) => m.status === 'finalizado').length}</Text>
                <Text style={styles.statLabel}>Partidas disputadas</Text>
              </AppCard>
              <AppCard style={styles.statCard}>
                <Text style={styles.statIcon}>👥</Text>
                <Text style={styles.statValue}>{result?.totalPlayers ?? champPlayers.length}</Text>
                <Text style={styles.statLabel}>Atletas participantes</Text>
              </AppCard>
              <AppCard style={styles.statCard}>
                <Text style={styles.statIcon}>🔴</Text>
                <Text style={styles.statValue}>{redCardCount}</Text>
                <Text style={styles.statLabel}>Cartões vermelhos</Text>
              </AppCard>
            </View>
          </View>

          {/* ── DESTAQUES ── */}
          {(result?.topScorerName || result?.mvpPlayerName || result?.fairPlayTeamName || result?.bestDefenseName) && (
            <View style={styles.section}>
              <SectionHeader title="DESTAQUES" />
              <AppCard style={styles.highlightsCard}>
                {result?.topScorerName && (
                  <HighlightRow
                    badge="🏹 ARTILHEIRO"
                    photoUrl={topScorerPlayer?.photoUrl}
                    name={result.topScorerName}
                    stat={`${result.topScorerGoals} gols`}
                    label="artilheiro"
                  />
                )}
                {result?.mvpPlayerName && (
                  <>
                    <View style={styles.highlightDivider} />
                    <HighlightRow
                      badge="🌟 MVP"
                      photoUrl={mvpPlayer?.photoUrl}
                      name={result.mvpPlayerName}
                      stat={result.mvpVotes ? `${result.mvpVotes} MVPs` : 'MVP'}
                      label="mvp"
                    />
                  </>
                )}
                {result?.fairPlayTeamName && (
                  <>
                    <View style={styles.highlightDivider} />
                    <HighlightRow
                      badge="🕊️ FAIR PLAY"
                      teamColor={fairPlayTeam?.primaryColor}
                      name={result.fairPlayTeamName}
                      stat={result.fairPlayCards !== undefined ? `${result.fairPlayCards} cartões` : 'Menor cartão'}
                      label="fairplay"
                    />
                  </>
                )}
                {result?.bestDefenseName && (
                  <>
                    <View style={styles.highlightDivider} />
                    <HighlightRow
                      badge="🛡️ DEFESA"
                      teamColor={bestDefenseTeam?.primaryColor}
                      name={result.bestDefenseName}
                      stat={`${result.bestDefenseGoals} gols sofridos`}
                      label="defesa"
                    />
                  </>
                )}
              </AppCard>
            </View>
          )}

          {/* ── ELENCO COMPLETO ── */}
          {sortedPlayers.length > 0 && (
            <View style={styles.section}>
              <SectionHeader
                title="ELENCO COMPLETO"
                subtitle={`${sortedPlayers.length} atletas`}
              />
              <AppCard style={styles.rosterCard}>
                {sortedPlayers.map((player, index) => {
                  const team = champTeams.find((t) => t.id === player.teamId);
                  return (
                    <React.Fragment key={player.id}>
                      {index > 0 && <View style={styles.rosterDivider} />}
                      <PlayerRow
                        player={player}
                        teamName={team?.name ?? ''}
                        goals={goalsByPlayer[player.id] ?? 0}
                        onPress={() =>
                          navigation.navigate('AthleteProfile', {
                            userId: player.userId,
                            championshipId,
                          })
                        }
                      />
                    </React.Fragment>
                  );
                })}
              </AppCard>
            </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  navBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skeletonWrap: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },

  // ── Hero ──
  hero: {
    height: 200,
    paddingTop: 16,
    paddingHorizontal: 24,
    justifyContent: 'flex-end',
    paddingBottom: 24,
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  heroTrophyBg: {
    position: 'absolute',
    right: -10,
    bottom: -20,
    opacity: 0.06,
  },
  heroMicro: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    letterSpacing: 3,
    color: colors.accent,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroYear: {
    fontFamily: 'Barlow-Black',
    fontSize: 72,
    color: colors.textPrimary,
    lineHeight: 76,
  },
  heroCaption: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },

  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 0,
  },

  // ── Champion card ──
  championCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    ...shadows.shadowGlow,
  },
  championMicro: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textOnAccent,
    textTransform: 'uppercase',
    marginBottom: 12,
    opacity: 0.75,
  },
  championRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  championName: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.textOnAccent,
    flex: 1,
  },
  championCap: {
    marginTop: 8,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textOnAccent,
    opacity: 0.7,
  },

  // ── Sections ──
  section: {
    marginBottom: 24,
    gap: 14,
  },

  // ── Podium ──
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },

  // ── Stats grid ──
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statCard: {
    width: '47.5%',
    alignItems: 'center',
    paddingVertical: 18,
    gap: 4,
  },
  statIcon: {
    fontSize: 22,
  },
  statValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 32,
    color: colors.accent,
    lineHeight: 36,
  },
  statLabel: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // ── Highlights ──
  highlightsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  highlightAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  highlightAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  highlightAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightAvatarInitials: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  highlightInfo: {
    flex: 1,
  },
  highlightName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  highlightStat: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  highlightBadge: {
    backgroundColor: colors.bg300,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  highlightBadgeText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  highlightDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },

  // ── Roster ──
  rosterCard: {
    padding: 0,
    overflow: 'hidden',
  },
  rosterDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  playerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  playerAvatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  playerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarInitials: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.textSecondary,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  playerTeam: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  playerGoals: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  playerGoalsValue: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  playerGoalsLabel: {
    fontSize: 13,
  },
});
