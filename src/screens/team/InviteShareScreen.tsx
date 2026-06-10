import React, { useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { AppCard } from '../../components/AppCard';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { shareInviteViaWhatsApp, regenerateTeamInvite } from '../../services/inviteService';
import { colors } from '../../theme/colors';
import { canCaptainManageTeam } from '../../utils/permissionRules';

type Props = NativeStackScreenProps<HomeStackParamList, 'InviteShare'>;

export function InviteShareScreen({ route }: Props) {
  const { teamId } = route.params;
  const user = useAuthStore((s) => s.user);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const updateTeam = useTeamStore((s) => s.updateTeam);
  const championships = useChampionshipStore((s) => s.championships);
  const [regenerating, setRegenerating] = useState(false);

  const team = teams.find((item) => item.id === teamId);
  const championship = championships.find((item) => item.id === team?.championshipId);
  const canManageInvite = !!team && canCaptainManageTeam(user, team);

  const availableSlots = useMemo(() => {
    const rosterSize = players.filter((item) => item.teamId === teamId).length;
    const maxPlayers = team?.maxPlayers ?? 15;
    return Math.max(0, maxPlayers - rosterSize);
  }, [players, team?.maxPlayers, teamId]);

  if (!team) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Time não encontrado.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!canManageInvite) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Apenas o capitão deste time pode ver o convite.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleRegenerate = () => {
    if (!canManageInvite) return;
    Alert.alert(
      'Gerar novo código',
      'Isso vai invalidar o código atual. Deseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Gerar',
          style: 'destructive',
          onPress: async () => {
            setRegenerating(true);
            try {
              const result = await regenerateTeamInvite(team);
              updateTeam(team.id, result);
              Toast.show({
                type: 'success',
                text1: 'Novo código gerado',
                text2: 'O código antigo foi invalidado.',
                visibilityTime: 2200,
              });
            } catch (error) {
              console.warn('[InviteShareScreen] regenerate failed:', error);
              Toast.show({
                type: 'error',
                text1: 'Não foi possível gerar um novo código',
                visibilityTime: 2400,
              });
            } finally {
              setRegenerating(false);
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={styles.headerTitle}>Convidar para {team.name}</Text>

        <AppCard style={styles.codeCard}>
          <Text style={styles.codeLabel}>CODIGO DE CONVITE</Text>
          <Text style={styles.codeValue}>{team.inviteCode}</Text>
          <Text style={styles.caption}>Válido para: {championship?.name ?? 'Campeonato'}</Text>
          <Text style={styles.captionMuted}>{availableSlots} vagas disponíveis</Text>
        </AppCard>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={async () => {
              await Clipboard.setStringAsync(team.inviteCode);
              Toast.show({
                type: 'success',
                text1: 'Copiado!',
                text2: 'Código copiado para a área de transferência.',
                visibilityTime: 1800,
              });
            }}
          >
            <Text style={styles.actionText}>📋 Copiar código</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() =>
              shareInviteViaWhatsApp(
                team.name,
                team.inviteCode,
                championship?.name ?? 'Campeonato',
              ).catch(() => {
                Toast.show({
                  type: 'error',
                  text1: 'WhatsApp indisponível',
                  text2: 'Verifique se o aplicativo está instalado.',
                  visibilityTime: 2200,
                });
              })
            }
          >
            <Text style={styles.actionText}>💬 Compartilhar no WhatsApp</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.regenerateSection}>
          <Text style={styles.regenerateText}>
            O código atual é permanente. Gere um novo para invalidar o anterior.
          </Text>
          <AppButton
            title={regenerating ? 'Gerando...' : 'Gerar novo código'}
            variant="outline"
            onPress={handleRegenerate}
            fullWidth
            disabled={regenerating}
          />
        </View>
      </View>
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
    gap: 20,
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 22,
    color: colors.textPrimary,
  },
  codeCard: {
    padding: 24,
    alignItems: 'center',
    borderColor: colors.accent,
  },
  codeLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 1.8,
  },
  codeValue: {
    marginTop: 8,
    fontFamily: 'Barlow-Black',
    fontSize: 56,
    color: colors.accent,
    letterSpacing: 8,
  },
  caption: {
    marginTop: 10,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textPrimary,
  },
  captionMuted: {
    marginTop: 4,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  actionRow: {
    gap: 12,
  },
  actionButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  regenerateSection: {
    gap: 12,
  },
  regenerateText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textSecondary,
  },
});
