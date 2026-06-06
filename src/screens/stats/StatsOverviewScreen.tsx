import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NavigationProp, useNavigation } from '@react-navigation/native';
import { AppCard } from '../../components/AppCard';
import { SectionHeader } from '../../components/SectionHeader';
import { TAB_NAMES } from '../../navigation/constants';
import { useStats } from '../../hooks/useStats';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { colors } from '../../theme/colors';
import { SuspendedPlayer } from '../../types';

type NavProp = NavigationProp<Record<string, object | undefined>>;

function HighlightCard({
  icon,
  label,
  value,
  accent = true,
}: {
  icon: string;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <AppCard style={styles.highlightCard}>
      <Text style={styles.highlightIcon}>{icon}</Text>
      <Text style={[styles.highlightValue, !accent && styles.highlightValueText]} numberOfLines={2}>
        {value}
      </Text>
      <Text style={styles.highlightLabel}>{label}</Text>
    </AppCard>
  );
}

function SuspendedRow({
  item,
  onPress,
}: {
  item: SuspendedPlayer;
  onPress: () => void;
}) {
  const isRed = item.reason === 'cartao_vermelho';

  return (
    <TouchableOpacity style={styles.suspendedRow} activeOpacity={0.82} onPress={onPress}>
      <View style={styles.suspendedAvatar}>
        <Text style={styles.suspendedAvatarText}>
          {item.playerName.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.suspendedCopy}>
        <Text style={styles.suspendedName}>{item.playerName}</Text>
        <Text style={styles.suspendedTeam}>{item.teamName}</Text>
      </View>
      <Text style={[styles.suspendedReason, isRed ? styles.reasonDanger : styles.reasonWarning]}>
        {isRed ? 'Cartao vermelho' : '3 amarelos'}
      </Text>
    </TouchableOpacity>
  );
}

export function StatsOverviewScreen() {
  const navigation = useNavigation<NavProp>();
  const champId = useChampionshipStore((s) => s.selectedChampionshipId) ?? '';
  const players = useTeamStore((s) => s.players);
  const {
    standings,
    bestAttack,
    bestDefense,
    roundMVP,
    suspendedPlayers,
    totalGoals,
    finishedCount,
    currentRound,
  } = useStats(champId);

  const leader = standings[0];
  const avgGoals = finishedCount > 0 ? (totalGoals / finishedCount).toFixed(1) : '0.0';
  const totalYellowCards = standings.reduce((sum, standing) => sum + standing.yellowCards, 0);

  const openAthlete = (playerId: string) => {
    const player = players.find((item) => item.id === playerId);
    if (!player?.userId) return;
    navigation.navigate(TAB_NAMES.PERFIL, {
      screen: 'AthleteProfile',
      params: {
        userId: player.userId,
        championshipId: champId,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          <HighlightCard icon="🏆" label="Lider" value={leader?.teamName ?? '—'} accent={false} />
          <HighlightCard icon="⚽" label="Gols totais" value={String(totalGoals)} />
          <HighlightCard icon="📊" label="Media/jogo" value={avgGoals} />
          <HighlightCard icon="🛡️" label="Melhor defesa" value={bestDefense?.teamName ?? '—'} accent={false} />
          <HighlightCard icon="⚡" label="Melhor ataque" value={bestAttack?.teamName ?? '—'} accent={false} />
          <HighlightCard icon="🟨" label="Cartoes" value={String(totalYellowCards)} />
        </View>

        <AppCard variant="accent" style={styles.roundLeaderCard}>
          <Text style={styles.roundLeaderEyebrow}>TIME DA RODADA</Text>
          <View style={styles.roundLeaderRow}>
            <View style={styles.roundLeaderCopy}>
              <Text style={styles.roundLeaderName}>{roundMVP?.teamName ?? '—'}</Text>
              <Text style={styles.roundLeaderSub}>Rodada {currentRound}</Text>
            </View>
            <Text style={styles.roundLeaderPoints}>{roundMVP?.points ?? 0} pts</Text>
          </View>
        </AppCard>

        {suspendedPlayers.length > 0 && (
          <View style={styles.suspendedSection}>
            <View style={styles.suspendedHeaderWrap}>
              <SectionHeader title="SUSPENSOS NA PROXIMA RODADA" />
            </View>
            <View style={styles.suspendedList}>
              {suspendedPlayers.map((player) => (
                <SuspendedRow
                  key={player.playerId}
                  item={player}
                  onPress={() => openAthlete(player.playerId)}
                />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  content: {
    padding: 20,
    paddingBottom: 28,
    gap: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  highlightCard: {
    width: '47.5%',
    height: 100,
    padding: 16,
    justifyContent: 'space-between',
  },
  highlightIcon: {
    fontSize: 28,
  },
  highlightValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    color: colors.accent,
    lineHeight: 26,
  },
  highlightValueText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  highlightLabel: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  roundLeaderCard: {
    width: '100%',
    padding: 18,
    backgroundColor: colors.accentGlow,
  },
  roundLeaderEyebrow: {
    fontFamily: 'Barlow-Bold',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.accent,
  },
  roundLeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  roundLeaderCopy: {
    flex: 1,
  },
  roundLeaderName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 22,
    color: colors.textPrimary,
  },
  roundLeaderSub: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  roundLeaderPoints: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.accent,
  },
  suspendedSection: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: 'rgba(255,184,0,0.08)',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderWidth: 1,
    borderColor: 'rgba(255,184,0,0.14)',
    overflow: 'hidden',
  },
  suspendedHeaderWrap: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  suspendedList: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
  },
  suspendedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  suspendedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
  },
  suspendedAvatarText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  suspendedCopy: {
    flex: 1,
  },
  suspendedName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  suspendedTeam: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  suspendedReason: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
  },
  reasonDanger: {
    color: colors.danger,
  },
  reasonWarning: {
    color: colors.warning,
  },
});
