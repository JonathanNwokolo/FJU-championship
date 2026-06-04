import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ConfettiCannon from 'react-native-confetti-cannon';
import * as Sharing from 'expo-sharing';
import ViewShot, { ViewShotRef } from 'react-native-view-shot';

import { colors } from '../../theme/colors';
import { PlayerCard } from '../../components/PlayerCard';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useRoundVoting } from '../../hooks/useRoundVoting';
import { calculateOverall } from '../../utils/playerOverall';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';

type RouteT = RouteProp<FixturesStackParamList, 'RoundAward'>;
type NavT = NavigationProp<FixturesStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function RoundAwardScreen() {
  const navigation = useNavigation<NavT>();
  const { params } = useRoute<RouteT>();
  const { championshipId, round } = params;

  const { events, matches } = useMatchStore();
  const { teams, players } = useTeamStore();
  const championships = useChampionshipStore((s) => s.championships);
  const championship = championships.find((c) => c.id === championshipId);

  const { winner, totalVotes } = useRoundVoting(championshipId, round);

  const confettiRef = useRef<ConfettiCannon>(null);
  const cardRef = useRef<ViewShotRef>(null);

  useEffect(() => {
    const timer = setTimeout(() => confettiRef.current?.start(), 300);
    return () => clearTimeout(timer);
  }, []);

  const winnerPlayer = winner ? players.find((p) => p.id === winner.winnerPlayerId) : null;
  const winnerTeam = winner ? teams.find((t) => t.id === winner.winnerTeamId) : null;

  const goals = winnerPlayer
    ? events.filter(
        (e) =>
          e.playerId === winnerPlayer.id &&
          e.type === 'gol',
      ).length
    : 0;

  const yellowCards = winnerPlayer
    ? events.filter(
        (e) =>
          e.playerId === winnerPlayer.id &&
          e.type === 'cartao_amarelo',
      ).length
    : 0;

  const redCards = winnerPlayer
    ? events.filter(
        (e) =>
          e.playerId === winnerPlayer.id &&
          e.type === 'cartao_vermelho',
      ).length
    : 0;

  const overall = winnerPlayer
    ? calculateOverall(goals, yellowCards, redCards)
    : 70;

  const handleShare = async () => {
    if (!cardRef.current) return;
    try {
      const uri = await cardRef.current!.capture!();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      } else {
        Alert.alert('Compartilhamento indisponível', 'Este dispositivo não suporta compartilhamento de imagens.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível compartilhar o card.');
    }
  };

  if (!winner || !winnerPlayer || !winnerTeam) {
    return (
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        style={styles.root}
      >
        <SafeAreaView edges={['top']}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.centered}>
          <Text style={styles.noWinnerText}>Votação ainda em aberto.</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[colors.primaryDark, colors.primary]}
      style={styles.root}
    >
      {/* Confetti */}
      <ConfettiCannon
        ref={confettiRef}
        count={180}
        origin={{ x: SCREEN_WIDTH / 2, y: -10 }}
        autoStart={false}
        fadeOut
        colors={[colors.accent, '#FFD700', colors.success, '#FF6B6B', '#FFFFFF']}
      />

      {/* Back button */}
      <SafeAreaView edges={['top']}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.titleLine1}>🏆</Text>
        <Text style={styles.titleLine2}>Craque da Rodada {round}</Text>

        {/* Capturable card */}
        <ViewShot ref={cardRef} options={{ format: 'png', quality: 1 }} style={styles.cardWrapper}>
          <PlayerCard
            player={winnerPlayer}
            team={winnerTeam}
            goals={goals}
            yellowCards={yellowCards}
            redCards={redCards}
            overall={overall}
            championshipName={championship?.name ?? 'Copa FJU'}
          />
        </ViewShot>

        <Text style={styles.votesText}>{totalVotes} votos</Text>

        <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
          <Ionicons name="share-social-outline" size={20} color={colors.primaryDark} />
          <Text style={styles.shareBtnText}>Compartilhar</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  backBtn: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    alignSelf: 'flex-start',
  },

  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
    marginTop: -20,
  },

  titleLine1: {
    fontSize: 48,
  },
  titleLine2: {
    fontSize: 26,
    fontWeight: '900',
    color: colors.accent,
    textAlign: 'center',
    letterSpacing: 0.5,
  },

  cardWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
  },

  votesText: {
    fontSize: 15,
    color: `${colors.textOnDark}80`,
    fontWeight: '500',
  },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 4,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primaryDark,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noWinnerText: {
    fontSize: 16,
    color: `${colors.textOnDark}80`,
  },
});
