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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { AppToggle } from '../../components/AppToggle';
import { SectionHeader } from '../../components/SectionHeader';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { Championship, ChampionshipFormat } from '../../types';
import { colors } from '../../theme/colors';
import { generateInviteCode } from '../../utils/generateInviteCode';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'CreateChampionship'>;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

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
  icon: IoniconName;
  disabled?: boolean;
}> = [
  {
    value: 'pontos_corridos',
    title: 'Pontos corridos',
    desc: 'Todos jogam contra todos',
    icon: 'repeat-outline',
  },
  {
    value: 'mata_mata',
    title: 'Mata-mata',
    desc: 'Eliminação direta',
    icon: 'flash-outline',
    disabled: true,
  },
  {
    value: 'grupos_e_mata_mata',
    title: 'Grupos + mata-mata',
    desc: 'Grupos e depois eliminatória',
    icon: 'layers-outline',
    disabled: true,
  },
];

export function CreateChampionshipScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const addChampionship = useChampionshipStore((s) => s.addChampionship);

  // Form state (unchanged)
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
      [{ text: 'Ver campeonatos', onPress: () => navigation.goBack() }],
    );
  };

  // ─── Draggable tiebreaker row ─────────────────────────────────────────────
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
          <Ionicons name="reorder-three-outline" size={20} color={colors.textMuted} />
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* ─── In-screen header ─── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>Novo Campeonato</Text>
          <Text style={styles.headerSubtitle}>Copa Tribo de Judá 2026</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── 1. Nome ── */}
        <AppTextField
          label=""
          value={name}
          onChangeText={(t) => { setName(t); setNameError(''); }}
          placeholder="Copa Tribo de Judá 2026"
          error={nameError}
        />

        {/* ── 2. Formato ── */}
        <View style={styles.sectionGap}>
          <SectionHeader title="FORMATO" />
        </View>
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
                {/* Icon box */}
                <View style={styles.formatIconBox}>
                  <Ionicons
                    name={opt.icon}
                    size={18}
                    color={selected ? colors.accent : colors.textSecondary}
                  />
                </View>

                {/* Text */}
                <View style={styles.formatTextBlock}>
                  <Text style={[styles.formatTitle, selected && styles.formatTitleSelected]}>
                    {opt.title}
                  </Text>
                  <Text style={styles.formatDesc}>{opt.desc}</Text>
                </View>

                {/* Coming soon badge OR radio */}
                {opt.disabled ? (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>Em breve</Text>
                  </View>
                ) : (
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── 3. Pontuação ── */}
        <View style={styles.sectionGap}>
          <SectionHeader title="PONTUAÇÃO" />
        </View>
        <View style={styles.pointsRow}>
          {[
            { label: 'Vitória',  value: pointsWin,  set: setPointsWin  },
            { label: 'Empate',   value: pointsDraw, set: setPointsDraw },
            { label: 'Derrota',  value: pointsLoss, set: setPointsLoss },
          ].map(({ label, value, set }) => (
            <View key={label} style={styles.pointCard}>
              <TextInput
                style={styles.pointInput}
                value={String(value)}
                onChangeText={(t) => set(Math.max(0, parseInt(t) || 0))}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
              />
              <Text style={styles.pointLabel}>{label}</Text>
            </View>
          ))}
        </View>

        {/* ── 4. Critérios de desempate ── */}
        <View style={styles.sectionGap}>
          <SectionHeader title="CRITÉRIOS DE DESEMPATE" subtitle="Segure e arraste para reordenar" />
        </View>
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
        <View style={styles.sectionGap}>
          <SectionHeader title="DISCIPLINA" />
        </View>
        <View style={styles.card}>
          <AppToggle
            label="Vermelho suspende a próxima"
            value={redCardSuspend}
            onValueChange={setRedCardSuspend}
          />
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
              trackColor={{ false: colors.bg300, true: colors.accent }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={colors.bg300}
            />
          </View>
        </View>

        {/* ── 6. Inscrições ── */}
        <View style={styles.sectionGap}>
          <SectionHeader title="INSCRIÇÕES" />
        </View>
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
        <View style={styles.sectionGap}>
          <SectionHeader title="EXTRAS DA FJU" />
        </View>
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },

  // ─── In-screen header ───
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
    lineHeight: 24,
  },
  headerSubtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ─── Scroll body ───
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 48,
  },

  sectionGap: {
    marginTop: 28,
    marginBottom: 14,
  },

  // ─── Format cards ───
  formatList: {
    gap: 10,
  },
  formatCard: {
    height: 72,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.bg200,
  },
  formatCardSelected: {
    borderColor: colors.accent,
    borderWidth: 2,
    backgroundColor: colors.accentGlow,
  },
  formatCardDisabled: {
    opacity: 0.45,
  },
  formatIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatTextBlock: {
    flex: 1,
    gap: 2,
  },
  formatTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  formatTitleSelected: {
    color: colors.accent,
  },
  formatDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
  },
  radioSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  comingSoonBadge: {
    backgroundColor: `${colors.textSecondary}22`,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.textSecondary,
  },

  // ─── Points ───
  pointsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pointCard: {
    flex: 1,
    backgroundColor: colors.bg300,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 4,
  },
  pointInput: {
    fontFamily: 'Barlow-Black',
    fontSize: 32,
    color: colors.textPrimary,
    textAlign: 'center',
    width: '100%',
    padding: 0,
  },
  pointLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ─── Tiebreaker ───
  tiebreakerContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tiebreakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.bg200,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap: 12,
  },
  tiebreakerRowActive: {
    backgroundColor: colors.bg300,
  },
  tiebreakerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiebreakerBadgeActive: {
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  tiebreakerBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.accent,
  },
  tiebreakerLabel: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textPrimary,
  },

  // ─── Card sections (Disciplina, Inscrições, Extras) ───
  card: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },

  // ─── Yellow cards row ───
  yellowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    gap: 8,
  },
  yellowTogglePart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yellowLabel: {
    fontFamily: 'Barlow-Medium',
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
    backgroundColor: colors.bg300,
    borderRadius: 8,
    textAlign: 'center',
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  yellowInputSuffix: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },

  // ─── Inline rows (Inscrições) ───
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  inlineRowBorder: {
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  inlineLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textPrimary,
  },
  inlineInput: {
    width: 60,
    height: 36,
    backgroundColor: colors.bg300,
    borderRadius: 8,
    textAlign: 'center',
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },

  submitButton: {
    marginTop: 32,
  },
});
