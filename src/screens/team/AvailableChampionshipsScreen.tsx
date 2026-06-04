import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';
import { EmptyState } from '../../components/EmptyState';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { Championship } from '../../types';
import { colors } from '../../theme/colors';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'AvailableChampionships'>;

const FORMAT_LABELS: Record<string, string> = {
  pontos_corridos:   'Pontos corridos',
  mata_mata:         'Mata-mata',
  grupos_e_mata_mata: 'Grupos + mata-mata',
};

export function AvailableChampionshipsScreen() {
  const navigation = useNavigation<NavProp>();
  const championships = useChampionshipStore((s) => s.championships);
  const teams = useTeamStore((s) => s.teams);

  const open = championships.filter((c) => c.status === 'inscricoes_abertas');

  const spotsLeft = (champ: Championship) => {
    const maxTeams = 16; // default — future: store this in Championship
    const enrolled = teams.filter((t) => t.championshipId === champ.id && t.status !== 'rejeitado').length;
    return Math.max(0, maxTeams - enrolled);
  };

  const renderItem = ({ item }: { item: Championship }) => {
    const spots = spotsLeft(item);
    return (
      <AppCard style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.champName}>{item.name}</Text>
          <View style={styles.formatBadge}>
            <Text style={styles.formatText}>{FORMAT_LABELS[item.format]}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoValue}>{item.totalRounds}</Text>
            <Text style={styles.infoLabel}>Rodadas</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={[styles.infoValue, spots <= 3 && styles.infoValueWarning]}>{spots}</Text>
            <Text style={styles.infoLabel}>Vagas</Text>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoItem}>
            <Text style={styles.infoValue}>{item.inviteCode}</Text>
            <Text style={styles.infoLabel}>Código</Text>
          </View>
        </View>

        <AppButton
          title="Inscrever meu time"
          onPress={() => navigation.navigate('CreateTeam', { championshipId: item.id })}
          fullWidth
          variant={spots === 0 ? 'outline' : 'primary'}
          disabled={spots === 0}
        />
        {spots === 0 && (
          <Text style={styles.fullText}>Campeonato lotado</Text>
        )}
      </AppCard>
    );
  };

  if (open.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon="📋"
          title="Nenhum campeonato aberto"
          description="Aguarde o organizador abrir as inscrições de um campeonato."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={open}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  champName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  formatBadge: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  formatText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
  },
  infoItem: {
    flex: 1,
    alignItems: 'center',
  },
  infoValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 0.5,
  },
  infoValueWarning: {
    color: colors.warning,
  },
  infoLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  infoDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  fullText: {
    textAlign: 'center',
    fontSize: 12,
    color: colors.danger,
    marginTop: -4,
  },
});
