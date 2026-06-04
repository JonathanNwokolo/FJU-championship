import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppButton } from '../../components/AppButton';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { Player, PlayerPosition, Team } from '../../types';
import { colors } from '../../theme/colors';
import { POSITION_COLORS, POSITION_LABELS } from '../../utils/constants';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'JoinTeam'>;

const POSITIONS: PlayerPosition[] = ['goleiro', 'zagueiro', 'lateral', 'meia', 'atacante'];

export function JoinTeamScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const { teams, players, addPlayer } = useTeamStore();
  const championships = useChampionshipStore((s) => s.championships);

  const [code, setCode] = useState('');
  const [foundTeam, setFoundTeam] = useState<Team | null>(null);
  const [searched, setSearched] = useState(false);
  const [position, setPosition] = useState<PlayerPosition>('meia');
  const [number, setNumber] = useState('');
  const [numberError, setNumberError] = useState('');
  const [joined, setJoined] = useState(false);

  const handleSearch = () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || normalized.length < 4) {
      Alert.alert('Código inválido', 'Digite o código completo de 6 caracteres.');
      return;
    }
    const team = teams.find((t) => t.inviteCode === normalized);
    setSearched(true);
    if (team) {
      setFoundTeam(team);
    } else {
      setFoundTeam(null);
      Alert.alert('Código não encontrado', 'Verifique o código e tente novamente.');
    }
  };

  const handleConfirm = () => {
    if (!foundTeam) return;
    const num = parseInt(number);
    if (!number || isNaN(num) || num < 1 || num > 99) {
      setNumberError('Número entre 1 e 99');
      return;
    }
    const teamPlayers = players.filter((p) => p.teamId === foundTeam.id);
    if (teamPlayers.some((p) => p.number === num)) {
      setNumberError('Número já em uso neste time');
      return;
    }

    const player: Player = {
      id: `player-${Date.now()}`,
      teamId: foundTeam.id,
      userId: user?.id,
      name: user?.name ?? 'Atleta',
      position,
      number: num,
    };
    addPlayer(player);
    setJoined(true);
  };

  const teamPlayerCount = foundTeam
    ? players.filter((p) => p.teamId === foundTeam.id).length
    : 0;

  const champName = foundTeam
    ? championships.find((c) => c.id === foundTeam.championshipId)?.name ?? '—'
    : '—';

  // ── Joined success ─────────────────────────────────────────────────────────
  if (joined && foundTeam) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.successContent}>
          <Text style={styles.successEmoji}>🎉</Text>
          <Text style={styles.successTitle}>Você entrou!</Text>
          <Text style={styles.successSub}>
            Bem-vindo ao time{'\n'}
            <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{foundTeam.name}</Text>
          </Text>
          <View style={[styles.teamPreview, { backgroundColor: foundTeam.primaryColor }]}>
            <Text style={[styles.teamPreviewName, { color: foundTeam.secondaryColor }]}>
              {foundTeam.name}
            </Text>
          </View>
          <AppButton
            title="Voltar ao início"
            onPress={() => navigation.navigate('HomeMain')}
            fullWidth
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Illustration */}
        <View style={styles.hero}>
          <Text style={styles.heroIcon}>🛡️</Text>
          <Text style={styles.heroTitle}>Entrar no time</Text>
          <Text style={styles.heroSub}>Digite o código que o capitão compartilhou</Text>
        </View>

        {/* Code input */}
        <View style={styles.codeContainer}>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(t) => { setCode(t.toUpperCase()); setSearched(false); setFoundTeam(null); }}
            placeholder="CODIGO"
            placeholderTextColor="#C0C0C0"
            maxLength={6}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        <AppButton
          title="Buscar time"
          onPress={handleSearch}
          fullWidth
          style={styles.searchBtn}
        />

        {/* Found team card */}
        {foundTeam && (
          <View style={styles.foundSection}>
            <Text style={styles.sectionLabel}>TIME ENCONTRADO</Text>

            <View style={styles.teamCard}>
              {/* Color stripe */}
              <View style={[styles.teamStripe, { backgroundColor: foundTeam.primaryColor }]} />
              <View style={styles.teamCardBody}>
                <View style={styles.teamCardRow}>
                  <View style={styles.colorDots}>
                    <View style={[styles.colorDot, { backgroundColor: foundTeam.primaryColor }]} />
                    <View style={[styles.colorDot, { backgroundColor: foundTeam.secondaryColor }]} />
                  </View>
                  <View style={styles.teamCardInfo}>
                    <Text style={styles.teamCardName}>{foundTeam.name}</Text>
                    <Text style={styles.teamCardChamp}>{champName}</Text>
                  </View>
                  <View style={styles.teamCardCount}>
                    <Text style={styles.countValue}>{teamPlayerCount}</Text>
                    <Text style={styles.countLabel}>atletas</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Position & number */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>SUA POSIÇÃO</Text>
            <View style={styles.chips}>
              {POSITIONS.map((pos) => {
                const selected = pos === position;
                const posColor = POSITION_COLORS[pos];
                return (
                  <TouchableOpacity
                    key={pos}
                    onPress={() => setPosition(pos)}
                    style={[
                      styles.chip,
                      selected
                        ? { backgroundColor: posColor }
                        : { backgroundColor: `${posColor}20` },
                    ]}
                  >
                    <Text style={[styles.chipText, { color: selected ? '#fff' : posColor }]}>
                      {POSITION_LABELS[pos]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>NÚMERO DA CAMISA</Text>
            <TextInput
              style={[styles.numberInput, !!numberError && styles.numberInputError]}
              value={number}
              onChangeText={(t) => { setNumber(t); setNumberError(''); }}
              placeholder="10"
              placeholderTextColor="#C0C0C0"
              keyboardType="number-pad"
              maxLength={2}
            />
            {!!numberError && <Text style={styles.errorText}>{numberError}</Text>}

            <AppButton
              title="Confirmar entrada"
              onPress={handleConfirm}
              fullWidth
              style={styles.confirmBtn}
            />
          </View>
        )}

        {searched && !foundTeam && (
          <View style={styles.notFoundBox}>
            <Text style={styles.notFoundIcon}>❌</Text>
            <Text style={styles.notFoundText}>Código não encontrado</Text>
            <Text style={styles.notFoundSub}>Verifique com o capitão do time</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
  },
  hero: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  heroIcon: {
    fontSize: 56,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heroSub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  codeContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  codeInput: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: 6,
    textAlign: 'center',
    width: '100%',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchBtn: {},
  foundSection: {
    marginTop: 28,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  teamCard: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    elevation: 2,
  },
  teamStripe: {
    width: 6,
  },
  teamCardBody: {
    flex: 1,
    padding: 14,
  },
  teamCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  colorDots: {
    flexDirection: 'row',
    gap: 4,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamCardInfo: {
    flex: 1,
  },
  teamCardName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  teamCardChamp: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  teamCardCount: {
    alignItems: 'center',
  },
  countValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  countLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  numberInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 56,
    paddingHorizontal: 14,
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    width: 100,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  numberInputError: {
    borderColor: colors.danger,
  },
  errorText: {
    fontSize: 12,
    color: colors.danger,
    marginTop: 4,
  },
  confirmBtn: {
    marginTop: 24,
  },
  notFoundBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  notFoundIcon: {
    fontSize: 40,
  },
  notFoundText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  notFoundSub: {
    fontSize: 13,
    color: colors.textSecondary,
  },

  // Success
  successContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 16,
  },
  successEmoji: { fontSize: 64 },
  successTitle: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  successSub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  teamPreview: {
    width: '100%',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginVertical: 8,
  },
  teamPreviewName: {
    fontSize: 20,
    fontWeight: '700',
  },
});
