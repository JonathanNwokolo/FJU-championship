import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppTextField } from '../../components/AppTextField';
import { AppButton } from '../../components/AppButton';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { Team } from '../../types';
import { colors } from '../../theme/colors';
import { generateInviteCode } from '../../utils/generateInviteCode';
import { TEAM_COLORS } from '../../utils/constants';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type Props = NativeStackScreenProps<HomeStackParamList, 'CreateTeam'>;

type SuccessState = { teamId: string; teamName: string; inviteCode: string };

export function CreateTeamScreen({ route, navigation }: Props) {
  const { championshipId } = route.params;
  const user = useAuthStore((s) => s.user);
  const addTeam = useTeamStore((s) => s.addTeam);

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [primaryColor, setPrimaryColor] = useState(TEAM_COLORS[0]);
  const [secondaryColor, setSecondaryColor] = useState(TEAM_COLORS[7]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const handleCreate = () => {
    if (!name.trim()) {
      setNameError('Digite o nome do time');
      return;
    }
    setLoading(true);
    const code = generateInviteCode();
    const team: Team = {
      id: `team-${Date.now()}`,
      championshipId,
      name: name.trim(),
      primaryColor,
      secondaryColor,
      captainId: user?.id ?? '',
      status: 'pendente',
      inviteCode: code,
      createdAt: new Date().toISOString(),
    };
    addTeam(team);
    setLoading(false);
    setSuccess({ teamId: team.id, teamName: team.name, inviteCode: code });
  };

  const handleShare = async (code: string, teamName: string) => {
    try {
      await Share.share({
        message: `Entre no meu time "${teamName}" no FJU Championship!\nUse o código: ${code}`,
      });
    } catch {
      // user cancelled
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.successContent}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Time criado!</Text>
          <Text style={styles.successSubtitle}>
            <Text style={{ fontWeight: '700' }}>{success.teamName}</Text> foi inscrito.{'\n'}
            Compartilhe o código com seus atletas:
          </Text>

          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>CÓDIGO DE CONVITE</Text>
            <Text style={styles.codeText}>{success.inviteCode}</Text>
          </View>

          <View style={styles.codeActions}>
            <AppButton
              title="Copiar"
              variant="outline"
              onPress={() => Alert.alert('Código copiado!', success.inviteCode)}
              style={styles.codeActionBtn}
            />
            <AppButton
              title="Compartilhar"
              variant="primary"
              onPress={() => handleShare(success.inviteCode, success.teamName)}
              style={styles.codeActionBtn}
            />
          </View>

          <AppButton
            title="Ir para meu time"
            variant="ghost"
            onPress={() => navigation.replace('ManageRoster', { teamId: success.teamId })}
            fullWidth
            style={styles.goTeamBtn}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionLabel}>NOME DO TIME</Text>
        <AppTextField
          label=""
          value={name}
          onChangeText={(t) => { setName(t); setNameError(''); }}
          placeholder="Ex: Leões de Judá"
          error={nameError}
        />

        <Text style={styles.sectionLabel}>COR PRINCIPAL</Text>
        <ColorPicker
          selected={primaryColor}
          onSelect={setPrimaryColor}
          exclude={secondaryColor}
        />

        <Text style={styles.sectionLabel}>COR SECUNDÁRIA</Text>
        <ColorPicker
          selected={secondaryColor}
          onSelect={setSecondaryColor}
          exclude={primaryColor}
        />

        {/* Preview */}
        <Text style={styles.sectionLabel}>PRÉVIA</Text>
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
    </SafeAreaView>
  );
}

// ── Color Picker ─────────────────────────────────────────────────────────────
function ColorPicker({
  selected,
  onSelect,
  exclude,
}: {
  selected: string;
  onSelect: (c: string) => void;
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
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 4,
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
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 17,
    fontWeight: '700',
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

  // Success
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
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  successSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  codeBox: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 32,
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  codeText: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 6,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  codeActionBtn: {
    flex: 1,
  },
  goTeamBtn: {
    marginTop: 8,
  },
});
