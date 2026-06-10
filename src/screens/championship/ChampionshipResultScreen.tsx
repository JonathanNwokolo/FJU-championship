import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import ConfettiCannon from 'react-native-confetti-cannon';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';
import { PodiumCard } from '../../components/PodiumCard';
import { TeamColorDot } from '../../components/TeamColorDot';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { colors, shadows } from '../../theme/colors';
import { getDocument } from '../../services/index';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { calculateStandings } from '../../services/statsService';
import { ChampionshipResultData, Player } from '../../types';
import { isActiveRosterPlayer } from '../../utils/teamRules';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type RouteT = RouteProp<HomeStackParamList, 'ChampionshipResult'>;
type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ChampionshipResult'>;

const { width: SCREEN_W } = Dimensions.get('window');

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

interface HighlightCardProps {
  icon: string;
  label: string;
  value: string;
  subValue?: string;
  teamColor?: string;
  photoUrl?: string;
}

function HighlightCard({ icon, label, value, subValue, teamColor, photoUrl }: HighlightCardProps) {
  return (
    <AppCard style={styles.highlightCard}>
      <View style={styles.highlightHeader}>
        <Text style={styles.highlightIcon}>{icon}</Text>
        <Text style={styles.highlightLabel}>{label}</Text>
      </View>
      <View style={styles.highlightContent}>
        {photoUrl && (
          <Image source={{ uri: photoUrl }} style={styles.highlightPhoto} />
        )}
        <View style={styles.highlightValueRow}>
          {teamColor && <TeamColorDot color={teamColor} size={10} />}
          <Text style={styles.highlightValue} numberOfLines={2}>
            {value}
          </Text>
        </View>
      </View>
      {subValue && <Text style={styles.highlightSub}>{subValue}</Text>}
    </AppCard>
  );
}

function BigStatCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <AppCard style={styles.bigStatCard}>
      <Text style={styles.bigStatIcon}>{icon}</Text>
      <Text style={styles.bigStatValue}>{value}</Text>
      <Text style={styles.bigStatLabel}>{label}</Text>
    </AppCard>
  );
}

export function ChampionshipResultScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteT>();
  const { championshipId, readOnly = true } = route.params;

  const championships = useChampionshipStore((s) => s.championships);
  const { teams, players } = useTeamStore();
  const matches = useMatchStore((s) => s.matches);
  const events = useMatchStore((s) => s.events);

  const [result, setResult] = useState<ChampionshipResultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(!readOnly);
  const shareRef = useRef<View>(null);
  const confettiRef = useRef<ConfettiCannon>(null);

  const championship = championships.find((c) => c.id === championshipId);
  const champTeams = teams.filter((t) => t.championshipId === championshipId);
  const champMatches = matches.filter((m) => m.championshipId === championshipId);
  const champEvents = events.filter((e) =>
    champMatches.some((m) => m.id === e.matchId)
  );
  // HISTÓRICO: inclui sem_time/removido para não apagar artilheiro/MVP que saiu.
  const champPlayers = players.filter((p) =>
    champTeams.some((t) => t.id === p.teamId)
  );
  // Contagem ATUAL de atletas: apenas vínculos ativos.
  const activeChampPlayers = champPlayers.filter(isActiveRosterPlayer);

  // Calculate standings for podium
  const standings = championship
    ? calculateStandings(champMatches, champEvents, champTeams, championship.rules)
    : [];

  useEffect(() => {
    const fetchResult = async () => {
      setLoading(true);
      try {
        const data = await getDocument<ChampionshipResultData>(
          'championship_results',
          championshipId
        );
        setResult(data);
      } catch (error) {
        console.warn('[ChampionshipResultScreen] Error:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchResult();
  }, [championshipId]);

  // Fire confetti on mount if not readOnly
  useEffect(() => {
    if (!readOnly && !loading && result) {
      setShowConfetti(true);
      // Auto-stop confetti after animation
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [readOnly, loading, result]);

  const handleShare = useCallback(async () => {
    if (!shareRef.current) return;
    setSharing(true);
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 1.0 });
      const dest = `${FileSystem.cacheDirectory}result-${championshipId}.png`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      await Sharing.shareAsync(dest, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar resultado',
      });
    } catch (e) {
      console.warn('Share failed', e);
    } finally {
      setSharing(false);
    }
  }, [championshipId]);

  // Helper to get player by ID
  const getPlayer = (playerId?: string): Player | undefined => {
    return champPlayers.find((p) => p.id === playerId);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Resultado</Text>
          <View style={{ width: 26 }} />
        </View>
        <View style={styles.loadingWrap}>
          <SkeletonLoader width="100%" height={200} borderRadius={16} />
          <SkeletonLoader width="100%" height={120} borderRadius={16} />
        </View>
      </SafeAreaView>
    );
  }

  const winnerTeam = champTeams.find((t) => t.id === result?.winnerId);
  const runnerUpTeam = champTeams.find((t) => t.id === result?.runnerUpId);
  const bestDefenseTeam = champTeams.find((t) => t.id === result?.bestDefenseId);
  const fairPlayTeam = champTeams.find((t) => t.id === result?.fairPlayTeamId);
  const topScorerPlayer = getPlayer(result?.topScorerId);
  const mvpPlayer = getPlayer(result?.mvpPlayerId);

  const finishedDate = formatDate(result?.finishedAt);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Confetti overlay */}
      {showConfetti && (
        <ConfettiCannon
          ref={confettiRef}
          count={150}
          origin={{ x: SCREEN_W / 2, y: -10 }}
          fadeOut
          autoStart
          colors={[colors.accent, '#FFD700', '#FFA500', '#FFFFFF', colors.primaryDark]}
          fallSpeed={2500}
        />
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Resultado</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner for finished championship */}
        {readOnly && finishedDate && (
          <View style={styles.finishedBanner}>
            <Text style={styles.finishedText}>
              🏆 Campeonato encerrado em {finishedDate}
            </Text>
          </View>
        )}

        {/* Shareable View */}
        <View ref={shareRef} collapsable={false} style={styles.shareableArea}>
          {/* Championship Header */}
          <View style={styles.champHeader}>
            <Text style={styles.champName}>{result?.championshipName ?? championship?.name}</Text>
            <Text style={styles.champSeason}>{result?.season}</Text>
          </View>

          {/* Champion Card - Maximum highlight */}
          <LinearGradient
            colors={[colors.accent, '#D4920F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.championCard}
          >
            <Text style={styles.championLabel}>🏆 CAMPEÃO</Text>
            <View style={[styles.championColorCircle, { backgroundColor: winnerTeam?.primaryColor ?? colors.accent }]}>
              <Text style={styles.championInitials}>
                {winnerTeam?.name?.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() ?? '🏆'}
              </Text>
            </View>
            <Text style={styles.championName}>
              {winnerTeam?.name ?? result?.winnerName ?? 'Campeão'}
            </Text>
            <Text style={styles.championCongrats}>Parabéns!</Text>
          </LinearGradient>

          {/* Podium */}
          {standings.length >= 3 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏅 Pódio</Text>
              <View style={styles.podiumRow}>
                <PodiumCard standing={standings[1]} place={2} />
                <PodiumCard standing={standings[0]} place={1} />
                <PodiumCard standing={standings[2]} place={3} />
              </View>
            </View>
          )}
        </View>

        {/* Championship Highlights - 2x3 Grid */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Destaques do Campeonato</Text>
          <View style={styles.highlightsGrid}>
            {/* Top Scorer */}
            <HighlightCard
              icon="⚽"
              label="Artilheiro"
              value={result?.topScorerName ?? 'N/A'}
              subValue={result?.topScorerGoals ? `${result.topScorerGoals} gols` : undefined}
              photoUrl={topScorerPlayer?.photoUrl}
            />

            {/* Best Defense */}
            <HighlightCard
              icon="🛡️"
              label="Melhor Defesa"
              value={result?.bestDefenseName ?? bestDefenseTeam?.name ?? 'N/A'}
              subValue={result?.bestDefenseGoals !== undefined ? `${result.bestDefenseGoals} gols sofridos` : undefined}
              teamColor={bestDefenseTeam?.primaryColor}
            />

            {/* MVP */}
            {result?.mvpPlayerName && (
              <HighlightCard
                icon="🌟"
                label="MVP"
                value={result.mvpPlayerName}
                subValue={result.mvpVotes ? `${result.mvpVotes} votos` : undefined}
                photoUrl={mvpPlayer?.photoUrl}
              />
            )}

            {/* Fair Play */}
            {result?.fairPlayTeamName && (
              <HighlightCard
                icon="🎖️"
                label="Fair Play"
                value={result.fairPlayTeamName}
                subValue={result.fairPlayCards !== undefined ? `${result.fairPlayCards} cartões` : undefined}
                teamColor={fairPlayTeam?.primaryColor}
              />
            )}
          </View>
        </View>

        {/* Big Stats Row */}
        <View style={styles.section}>
          <View style={styles.bigStatsRow}>
            <BigStatCard
              icon="📊"
              value={String(result?.totalGoals ?? 0)}
              label="Total de gols"
            />
            <BigStatCard
              icon="🏟️"
              value={String(result?.totalMatches ?? 0)}
              label="Partidas jogadas"
            />
          </View>
        </View>

        {/* Championship Info */}
        <View style={styles.section}>
          <AppCard style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Formato</Text>
              <Text style={styles.infoValue}>
                {result?.format === 'pontos_corridos' ? 'Pontos corridos' :
                 result?.format === 'mata_mata' ? 'Mata-mata' :
                 result?.format === 'grupos_e_mata_mata' ? 'Grupos + Mata-mata' :
                 result?.format ?? 'N/A'}
              </Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Times</Text>
              <Text style={styles.infoValue}>{result?.totalTeams ?? champTeams.length}</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Atletas</Text>
              <Text style={styles.infoValue}>{result?.totalPlayers ?? activeChampPlayers.length}</Text>
            </View>
            <View style={styles.infoDivider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Vice-campeão</Text>
              <View style={styles.infoTeamRow}>
                {runnerUpTeam && <TeamColorDot color={runnerUpTeam.primaryColor} size={10} />}
                <Text style={styles.infoValue}>
                  {runnerUpTeam?.name ?? result?.runnerUpName ?? 'N/A'}
                </Text>
              </View>
            </View>
          </AppCard>
        </View>

        {/* Share Button */}
        <View style={styles.shareSection}>
          <AppButton
            title={sharing ? 'Compartilhando...' : '📤 COMPARTILHAR RESULTADO'}
            onPress={handleShare}
            fullWidth
            disabled={sharing}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg200,
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  loadingWrap: {
    padding: 20,
    gap: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  shareableArea: {
    backgroundColor: colors.bg100,
  },
  finishedBanner: {
    backgroundColor: colors.accentGlow,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  finishedText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.accent,
    textAlign: 'center',
  },

  // Championship Header
  champHeader: {
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 16,
    gap: 4,
  },
  champName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  champSeason: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textSecondary,
  },

  // Champion Card
  championCard: {
    margin: 16,
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
    ...shadows.shadowGlow,
  },
  championLabel: {
    fontFamily: 'Barlow-Black',
    fontSize: 14,
    color: colors.primaryDark,
    letterSpacing: 4,
    marginBottom: 16,
  },
  championColorCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  championInitials: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  championName: {
    fontFamily: 'Barlow-Black',
    fontSize: 32,
    color: colors.primaryDark,
    textAlign: 'center',
    lineHeight: 36,
  },
  championCongrats: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: 'rgba(13,27,42,0.6)',
    marginTop: 8,
  },

  // Section
  section: {
    paddingHorizontal: 16,
    marginTop: 24,
    gap: 14,
  },
  sectionTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },

  // Podium
  podiumRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingTop: 10,
  },

  // Highlights Grid
  highlightsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  highlightCard: {
    width: '48%',
    padding: 14,
    gap: 6,
  },
  highlightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  highlightIcon: {
    fontSize: 18,
  },
  highlightLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  highlightContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  highlightPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg300,
  },
  highlightValueRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  highlightValue: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
  },
  highlightSub: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
  },

  // Big Stats
  bigStatsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  bigStatCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  bigStatIcon: {
    fontSize: 24,
  },
  bigStatValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 36,
    color: colors.accent,
  },
  bigStatLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Info Card
  infoCard: {
    padding: 0,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  infoLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textSecondary,
  },
  infoValue: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  infoTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
  },

  // Share Section
  shareSection: {
    paddingHorizontal: 16,
    marginTop: 28,
  },
});
