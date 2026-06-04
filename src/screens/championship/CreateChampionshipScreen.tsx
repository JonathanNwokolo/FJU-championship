import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { AppToggle } from '../../components/AppToggle';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { Championship, ChampionshipFormat } from '../../types';
import { colors } from '../../theme/colors';
import { generateInviteCode } from '../../utils/generateInviteCode';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'CreateChampionship'>;

type TiebreakerItem = { key: string; label: string };

const DEFAULT_TIEBREAKERS: TiebreakerItem[] = [
  { key: 'goalDiff',   label: 'Saldo de gols' },
  { key: 'goalsFor',   label: 'Gols marcados' },
  { key: 'headToHead', label: 'Confronto direto' },
  { key: 'fairPlay',   label: 'Fair play (menos cartões)' },
];

const FORMAT_OPTIONS: Array<{
  value: ChampionshipFormat;
  title: string;
  desc: string;
  disabled?: boolean;
}> = [
  { value: 'pontos_corridos',      title: 'Pontos corridos',    desc: 'Todos jogam contra todos' },
  { value: 'mata_mata',            title: 'Mata-mata',          desc: 'Eliminação direta',          disabled: true },
  { value: 'grupos_e_mata_mata',   title: 'Grupos + mata-mata', desc: 'Grupos e depois eliminatória', disabled: true },
];

export function CreateChampionshipScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const addChampionship = useChampionshipStore((s) => s.addChampionship);

  // Form state
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [format, setFormat] = useState<ChampionshipFormat>('pontos_corridos');
  const [pointsWin, setPointsWin] = useState(3);
  const [pointsDraw, setPointsDraw] = useState(1);
  const [pointsLoss, setPointsLoss] = useState(0);
  const [tiebreakers, setTiebreakers] = useState<TiebreakerItem[]>(DEFAULT_TIEBREAKERS);
  const [redCardSuspend, setRedCardSuspend] = useState(true);
  const [yellowSuspend, setYellowSuspend] = useState(true);
  const [yellowsToSuspend, setYellowsToSuspend] = useState('3');
  const [maxPlayers, setMaxPlayers] = useState('15');
  const [maxTeams, setMaxTeams] = useState('16');
  const [manualApproval, setManualApproval] = useState(true);
  const [fairPlayPrize, setFairPlayPrize] = useState(true);
  const [matchVerse, setMatchVerse] = useState(false);
  const [playerOfRound, setPlayerOfRound] = useState(true);
  const [liveMode, setLiveMode] = useState(false);

  const handleCreate = () => {
    if (!name.trim()) {
      setNameError('Digite o nome do campeonato');
      return;
    }

    const maxT = parseInt(maxTeams) || 8;
    const totalRounds = maxT % 2 === 0 ? maxT - 1 : maxT;

    const championship: Championship = {
      id: `champ-${Date.now()}`,
      name: name.trim(),
      format,
      status: 'inscricoes_abertas',
      currentRound: 0,
      totalRounds,
      organizerId: user?.id ?? '',
      inviteCode: generateInviteCode(),
      rules: {
        pointsWin,
        pointsDraw,
        pointsLoss,
        tiebreakers: tiebreakers.map((t) => t.key),
        fairPlay: fairPlayPrize,
        craqueDaRodada: playerOfRound,
      },
      createdAt: new Date().toISOString(),
    };

    addChampionship(championship);
    Alert.alert(
      'Campeonato criado! 🏆',
      `"${championship.name}" está pronto.\n\nCódigo de convite: ${championship.inviteCode}`,
      [{ text: 'Ver campeonatos', onPress: () => navigation.goBack() }]
    );
  };

  // ─── Draggable tiebreaker row ────────────────────────────────────────────
  const renderTiebreakerItem = ({
    item,
    drag,
    isActive,
    getIndex,
  }: RenderItemParams<TiebreakerItem>) => {
    const index = (getIndex() ?? 0) + 1;
    return (
      <ScaleDecorator activeScale={1.03}>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
          activeOpacity={0.85}
          style={[styles.tiebreakerRow, isActive && styles.tiebreakerRowActive]}
        >
          <View style={[styles.tiebreakerBadge, isActive && styles.tiebreakerBadgeActive]}>
            <Text style={styles.tiebreakerBadgeText}>{index}</Text>
          </View>
          <Text style={styles.tiebreakerLabel}>{item.label}</Text>
          <Text style={styles.dragHandle}>☰</Text>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. Nome ── */}
        <Text style={styles.sectionLabel}>NOME DO CAMPEONATO</Text>
        <AppTextField
          label=""
          value={name}
          onChangeText={(t) => { setName(t); setNameError(''); }}
          placeholder="Copa Tribo de Judá 2026"
          error={nameError}
        />

        {/* ── 2. Formato ── */}
        <Text style={styles.sectionLabel}>FORMATO</Text>
        <View style={styles.formatList}>
          {FORMAT_OPTIONS.map((opt) => {
            const selected = format === opt.value && !opt.disabled;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.formatCard,
                  selected && styles.formatCardSelected,
                  opt.disabled && styles.formatCardDisabled,
                ]}
                onPress={() => !opt.disabled && setFormat(opt.value)}
                activeOpacity={opt.disabled ? 1 : 0.8}
                disabled={opt.disabled}
              >
                <View style={styles.formatCardRow}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.formatTitle, selected && styles.formatTitleSelected]}>
                    {opt.title}
                  </Text>
                  {opt.disabled && (
                    <View style={styles.comingSoonBadge}>
                      <Text style={styles.comingSoonText}>Em breve</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.formatDesc}>{opt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 3. Pontuação ── */}
        <Text style={styles.sectionLabel}>PONTUAÇÃO</Text>
        <View style={styles.pointsRow}>
          {[
            { label: 'Vitória', value: pointsWin,  set: setPointsWin  },
            { label: 'Empate',  value: pointsDraw, set: setPointsDraw },
            { label: 'Derrota', value: pointsLoss, set: setPointsLoss },
          ].map(({ label, value, set }) => (
            <View key={label} style={styles.pointCard}>
              <Text style={styles.pointCardLabel}>{label}</Text>
              <TextInput
                style={styles.pointCardValue}
                value={String(value)}
                onChangeText={(t) => set(Math.max(0, parseInt(t) || 0))}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
            </View>
          ))}
        </View>

        {/* ── 4. Critérios de desempate ── */}
        <Text style={styles.sectionLabel}>CRITÉRIOS DE DESEMPATE</Text>
        <Text style={styles.hint}>Segure e arraste para reordenar a prioridade</Text>
        <View style={styles.tiebreakerContainer}>
          <DraggableFlatList
            data={tiebreakers}
            onDragEnd={({ data }) => setTiebreakers(data)}
            keyExtractor={(item) => item.key}
            renderItem={renderTiebreakerItem}
            scrollEnabled={false}
          />
        </View>

        {/* ── 5. Disciplina ── */}
        <Text style={styles.sectionLabel}>DISCIPLINA</Text>
        <View style={styles.card}>
          <AppToggle
            label="Vermelho suspende a próxima"
            value={redCardSuspend}
            onValueChange={setRedCardSuspend}
          />
          {/* Yellow cards row with inline input */}
          <View style={styles.yellowRow}>
            <TouchableOpacity
              style={styles.yellowTogglePart}
              onPress={() => setYellowSuspend(!yellowSuspend)}
              activeOpacity={0.7}
            >
              <Text style={styles.yellowLabel}>Amarelos para suspensão</Text>
              {yellowSuspend && (
                <View style={styles.yellowInputGroup}>
                  <TextInput
                    style={styles.yellowInput}
                    value={yellowsToSuspend}
                    onChangeText={setYellowsToSuspend}
                    keyboardType="number-pad"
                    maxLength={2}
                    onPressIn={(e) => e.stopPropagation()}
                  />
                  <Text style={styles.yellowInputSuffix}>cart.</Text>
                </View>
              )}
            </TouchableOpacity>
            <Switch
              value={yellowSuspend}
              onValueChange={setYellowSuspend}
              trackColor={{ false: '#D0D0D0', true: colors.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#D0D0D0"
            />
          </View>
        </View>

        {/* ── 6. Inscrições ── */}
        <Text style={styles.sectionLabel}>INSCRIÇÕES</Text>
        <View style={styles.card}>
          <View style={styles.inlineRow}>
            <Text style={styles.inlineLabel}>Máx. atletas por time</Text>
            <TextInput
              style={styles.inlineInput}
              value={maxPlayers}
              onChangeText={setMaxPlayers}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          <View style={[styles.inlineRow, styles.inlineRowBorder]}>
            <Text style={styles.inlineLabel}>Máx. de times</Text>
            <TextInput
              style={styles.inlineInput}
              value={maxTeams}
              onChangeText={setMaxTeams}
              keyboardType="number-pad"
              maxLength={2}
            />
          </View>
          <AppToggle
            label="Aprovar times manualmente"
            value={manualApproval}
            onValueChange={setManualApproval}
            description="Cada time precisa de aprovação antes de entrar"
          />
        </View>

        {/* ── 7. Extras da FJU ── */}
        <Text style={styles.sectionLabel}>EXTRAS DA FJU</Text>
        <View style={styles.card}>
          <AppToggle
            label="Prêmio Fair Play"
            value={fairPlayPrize}
            onValueChange={setFairPlayPrize}
            description="Destaque para o time com menos cartões"
          />
          <AppToggle
            label="Versículo da partida"
            value={matchVerse}
            onValueChange={setMatchVerse}
            description="Exibe versículo bíblico em cada jogo"
          />
          <AppToggle
            label="Craque da rodada"
            value={playerOfRound}
            onValueChange={setPlayerOfRound}
            description="Destaque o melhor jogador de cada rodada"
          />
          <AppToggle
            label="Modo ao vivo"
            value={liveMode}
            onValueChange={setLiveMode}
            description="Placar em tempo real durante as partidas"
          />
        </View>

        {/* ── Submit ── */}
        <AppButton
          title="Criar campeonato"
          onPress={handleCreate}
          fullWidth
          style={styles.submitButton}
        />
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
    paddingTop: 8,
    paddingBottom: 48,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.8,
    color: colors.textSecondary,
    marginTop: 24,
    marginBottom: 12,
  },
  hint: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: -8,
    marginBottom: 10,
  },

  // Card base (sections)
  card: {
    backgroundColor: colors.background,
    borderRadius: 16,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    elevation: 2,
  },

  // Format cards
  formatList: {
    gap: 10,
  },
  formatCard: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    backgroundColor: colors.background,
  },
  formatCardSelected: {
    borderColor: colors.accent,
    backgroundColor: `${colors.accent}0D`,
  },
  formatCardDisabled: {
    opacity: 0.5,
  },
  formatCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  formatTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  formatTitleSelected: {
    color: colors.accent,
  },
  formatDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginLeft: 28,
  },
  comingSoonBadge: {
    backgroundColor: `${colors.textSecondary}22`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Points
  pointsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pointCard: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    elevation: 2,
  },
  pointCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pointCardValue: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    width: '100%',
    padding: 0,
  },

  // Tiebreaker drag list
  tiebreakerContainer: {
    backgroundColor: colors.background,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    elevation: 2,
  },
  tiebreakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.background,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    gap: 12,
  },
  tiebreakerRowActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 8,
  },
  tiebreakerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiebreakerBadgeActive: {
    backgroundColor: `${colors.accent}22`,
  },
  tiebreakerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tiebreakerLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.textPrimary,
  },
  dragHandle: {
    fontSize: 15,
    color: colors.textSecondary,
    letterSpacing: -1,
  },

  // Discipline — yellow row with inline input
  yellowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderLight,
    gap: 8,
  },
  yellowTogglePart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yellowLabel: {
    fontSize: 15,
    color: colors.textPrimary,
    flex: 1,
  },
  yellowInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  yellowInput: {
    width: 40,
    height: 34,
    backgroundColor: colors.surface,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  yellowInputSuffix: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  // Inline rows (Inscrições)
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  inlineRowBorder: {
    borderTopWidth: 0.5,
    borderTopColor: colors.borderLight,
  },
  inlineLabel: {
    fontSize: 15,
    color: colors.textPrimary,
  },
  inlineInput: {
    width: 60,
    height: 36,
    backgroundColor: colors.surface,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  submitButton: {
    marginTop: 32,
  },
});
