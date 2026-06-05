import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppTextField } from '../../components/AppTextField';
import { AppButton } from '../../components/AppButton';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { colors } from '../../theme/colors';
import { TEAM_COLORS } from '../../utils/constants';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { createInviteLink, createTeamInvite, generateInviteCode } from '../../services/inviteService';
import { setDocument, getCollection } from '../../services/firestore';
import { Team } from '../../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'CreateTeam'>;
type SuccessState = { teamId: string; teamName: string; inviteCode: string };

const DEFAULT_MAX_PLAYERS = 15;

export function CreateTeamScreen({ route, navigation }: Props) {
  const { championshipId } = route.params;
  const user = useAuthStore((s) => s.user);
  const addTeam = useTeamStore((s) => s.addTeam);
  const championship = useChampionshipStore((s) =>
    s.championships.find((c) => c.id === championshipId),
  );

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [primaryColor, setPrimaryColor] = useState(TEAM_COLORS[0]);
  const [secondaryColor, setSecondaryColor] = useState(TEAM_COLORS[7]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setNameError('Digite o nome do time');
      return;
    }

    // Validate that championship is still accepting registrations
    if (championship) {
      const deadlinePassed =
        championship.registrationDeadline &&
        new Date(championship.registrationDeadline).getTime() < Date.now();
      if (championship.registrationsClosed || deadlinePassed) {
        Toast.show({
          type: 'error',
          text1: 'Inscrições encerradas',
          text2: 'O prazo de inscrição deste campeonato já encerrou.',
          visibilityTime: 3000,
        });
        return;
      }
      if (championship.status === 'em_andamento' || championship.status === 'finalizado') {
        Toast.show({
          type: 'error',
          text1: 'Campeonato em andamento',
          text2: 'Não é possível inscrever novos times neste momento.',
          visibilityTime: 3000,
        });
        return;
      }
      // Validate maxTeams cap
      if (championship.maxTeams) {
        const existingTeams = await getCollection<Team>('teams', [
          { field: 'championshipId', operator: '==', value: championshipId },
          { field: 'status', operator: '!=', value: 'rejeitado' },
        ]);
        if (existingTeams.length >= championship.maxTeams) {
          Toast.show({
            type: 'error',
            text1: 'Limite de times atingido',
            text2: `Este campeonato aceita no máximo ${championship.maxTeams} times.`,
            visibilityTime: 3500,
          });
          return;
        }
      }
    }

    setLoading(true);
    try {
      const inviteCode = await generateInviteCode();
      const inviteLink = createInviteLink(inviteCode);
      const teamId = `team-${Date.now()}`;
      const team: Team = {
        id: teamId,
        championshipId,
        name: name.trim(),
        primaryColor,
        secondaryColor,
        captainId: user?.id ?? '',
        status: championship?.rules?.manualApproval !== false ? 'pendente' : 'aprovado',
        inviteCode,
        inviteLink,
        maxPlayers: championship?.maxPlayers ?? DEFAULT_MAX_PLAYERS,
        registrationOpen: true,
        pendingRequests: [],
        createdAt: new Date().toISOString(),
      };

      await setDocument('teams', teamId, team);
      await createTeamInvite(team);
      addTeam(team);
      setSuccess({ teamId, teamName: team.name, inviteCode });
    } catch (error) {
      console.warn('[CreateTeamScreen] create team failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Nao foi possivel criar o time',
        text2: 'Tente novamente em instantes.',
        visibilityTime: 2600,
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.successContent}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Time criado!</Text>
          <Text style={styles.successSubtitle}>
            <Text style={styles.successStrong}>{success.teamName}</Text> foi inscrito.
          </Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>CODIGO DE CONVITE</Text>
            <Text style={styles.codeText}>{success.inviteCode}</Text>
          </View>

          <AppButton
            title="Copiar codigo"
            variant="outline"
            onPress={async () => {
              await Clipboard.setStringAsync(success.inviteCode);
              Toast.show({
                type: 'success',
                text1: 'Copiado!',
                text2: 'Codigo do time copiado para a area de transferencia.',
                visibilityTime: 2000,
              });
            }}
            fullWidth
          />

          <AppButton
            title="Ir para meu time"
            variant="ghost"
            onPress={() => navigation.replace('ManageRoster', { teamId: success.teamId })}
            fullWidth
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionLabel}>NOME DO TIME</Text>
          <AppTextField
            value={name}
            onChangeText={(value) => {
              setName(value);
              setNameError('');
            }}
            placeholder="Ex: Leoes de Juda"
            error={nameError}
          />

          <Text style={styles.sectionLabel}>COR PRINCIPAL</Text>
          <ColorPicker selected={primaryColor} onSelect={setPrimaryColor} exclude={secondaryColor} />

          <Text style={styles.sectionLabel}>COR SECUNDARIA</Text>
          <ColorPicker selected={secondaryColor} onSelect={setSecondaryColor} exclude={primaryColor} />

          <Text style={styles.sectionLabel}>PREVIA</Text>
          <View style={[styles.preview, { backgroundColor: primaryColor }]}>
            <Text style={[styles.previewText, { color: secondaryColor }]}>
              {name.trim() || 'Nome do time'}
            </Text>
            <View style={[styles.previewDot, { backgroundColor: secondaryColor }]} />
          </View>

          <AppButton
            title="Criar time"
            onPress={handleCreate}
            loading={loading}
            fullWidth
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ColorPicker({
  selected,
  onSelect,
  exclude,
}: {
  selected: string;
  onSelect: (color: string) => void;
  exclude?: string;
}) {
  return (
    <View style={pickerStyles.row}>
      {TEAM_COLORS.map((color) => {
        const isSelected = color === selected;
        const isExcluded = color === exclude;
        return (
          <TouchableOpacity
            key={color}
            onPress={() => !isExcluded && onSelect(color)}
            disabled={isExcluded}
            style={[
              pickerStyles.dot,
              { backgroundColor: color },
              isSelected && pickerStyles.dotSelected,
              isExcluded && pickerStyles.dotExcluded,
            ]}
            activeOpacity={0.8}
          />
        );
      })}
    </View>
  );
}

const pickerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  dot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  dotSelected: {
    borderColor: colors.accent,
  },
  dotExcluded: {
    opacity: 0.25,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginTop: 24,
    marginBottom: 12,
  },
  preview: {
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 64,
  },
  previewText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 17,
    flex: 1,
  },
  previewDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  submitBtn: {
    marginTop: 32,
  },
  successContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  successEmoji: {
    fontSize: 64,
  },
  successTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 28,
    color: colors.textPrimary,
  },
  successSubtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  successStrong: {
    fontFamily: 'Barlow-Bold',
    color: colors.textPrimary,
  },
  codeBox: {
    width: '100%',
    paddingVertical: 20,
    paddingHorizontal: 24,
    borderRadius: 18,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.accent,
    alignItems: 'center',
  },
  codeLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 1.6,
  },
  codeText: {
    marginTop: 8,
    fontFamily: 'Barlow-Black',
    fontSize: 36,
    color: colors.accent,
    letterSpacing: 6,
  },
});
