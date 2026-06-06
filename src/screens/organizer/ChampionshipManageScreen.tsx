import React, { useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { AppButton } from '../../components/AppButton';
import { Badge } from '../../components/Badge';
import { TeamColorDot } from '../../components/TeamColorDot';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import {
  Team,
  MatchModel,
  ChampionshipStatus,
  ChampionshipFormat,
  ChampionshipRules,
  MatchStatus,
} from '../../types';
import { OrganizerStackParamList } from '../../navigation/OrganizerStackNavigator';
import { TAB_NAMES } from '../../navigation/constants';
import { updateDocument, deleteDocument } from '../../services/firestore';
import { startChampionship, MIN_TEAMS_TO_START } from '../../services/fixturesService';
import { finishChampionship } from '../../services/championshipFinisher';
import { notifyTeamApproved, notifyTeamRejected } from '../../services/notificationService';
import { colors } from '../../theme/colors';

type RouteT = RouteProp<OrganizerStackParamList, 'ChampionshipManage'>;
type NavT = NativeStackNavigationProp<OrganizerStackParamList, 'ChampionshipManage'>;

const HEADER_DARK = '#0D1B2A';

type TabKey = 'overview' | 'teams' | 'matches' | 'settings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Visão Geral' },
  { key: 'teams', label: 'Times' },
  { key: 'matches', label: 'Partidas' },
  { key: 'settings', label: 'Configurações' },
];

const FORMAT_LABELS: Record<ChampionshipFormat, string> = {
  pontos_corridos: 'Pontos corridos',
  mata_mata: 'Mata-mata',
  grupos_e_mata_mata: 'Grupos + mata-mata',
};

const STATUS_LABELS: Record<ChampionshipStatus, string> = {
  inscricoes_abertas: 'Inscrições abertas',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const STATUS_VARIANT: Record<ChampionshipStatus, 'pending' | 'approved' | 'round'> = {
  inscricoes_abertas: 'pending',
  em_andamento: 'approved',
  finalizado: 'round',
};

const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  agendado: 'Agendado',
  ao_vivo: 'Ao vivo',
  finalizado: 'Finalizado',
};

const MATCH_STATUS_VARIANT: Record<MatchStatus, 'round' | 'live' | 'approved'> = {
  agendado: 'round',
  ao_vivo: 'live',
  finalizado: 'approved',
};

const TIEBREAKER_LABELS: Record<string, string> = {
  saldo_gols: 'Saldo de gols',
  gols_pro: 'Gols marcados',
  confronto_direto: 'Confronto direto',
  fair_play: 'Fair play (menos cartões)',
};

export function ChampionshipManageScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;

  const championship = useChampionshipStore((s) =>
    s.championships.find((c) => c.id === championshipId),
  );
  const updateChampionship = useChampionshipStore((s) => s.updateChampionship);
  const removeChampionship = useChampionshipStore((s) => s.removeChampionship);
  const user = useAuthStore((s) => s.user);

  const allTeams = useTeamStore((s) => s.teams);
  const allPlayers = useTeamStore((s) => s.players);
  const updateTeam = useTeamStore((s) => s.updateTeam);
  const allMatches = useMatchStore((s) => s.matches);

  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [approvingTeamId, setApprovingTeamId] = useState<string | null>(null);
  const [rejectingTeamId, setRejectingTeamId] = useState<string | null>(null);

  const champTeams = useMemo(
    () => allTeams.filter((t) => t.championshipId === championshipId),
    [allTeams, championshipId],
  );
  const approvedTeams = champTeams.filter((t) => t.status === 'aprovado');
  const champPlayers = useMemo(
    () => allPlayers.filter((p) => champTeams.some((t) => t.id === p.teamId)),
    [allPlayers, champTeams],
  );
  const champMatches = useMemo(
    () => allMatches.filter((m) => m.championshipId === championshipId),
    [allMatches, championshipId],
  );

  // Ownership gate: ações administrativas só para o dono do campeonato.
  const isOwner = !!championship && championship.organizerId === user?.id;

  if (!championship) {
    return (
      <View style={styles.root}>
        <SafeAreaView edges={['top']} style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={26} color={colors.accent} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>Campeonato</Text>
          <View style={styles.backBtn} />
        </SafeAreaView>
        <View style={styles.missingWrap}>
          <MaterialCommunityIcons name="trophy-broken" size={56} color={colors.textMuted} />
          <Text style={styles.missingText}>Campeonato não encontrado.</Text>
        </View>
      </View>
    );
  }

  // ─── Ações administrativas ──────────────────────────────────────────────────
  const persistChampionship = async (updates: Record<string, unknown>) => {
    await updateDocument('championships', championshipId, updates);
    updateChampionship(championshipId, updates);
  };

  const handleCloseRegistrations = () => {
    if (!isOwner) return;
    Alert.alert('Encerrar inscrições', 'Nenhum time novo poderá se inscrever. Continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Encerrar',
        onPress: async () => {
          try {
            await persistChampionship({ registrationsClosed: true });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Toast.show({ type: 'success', text1: 'Inscrições encerradas', visibilityTime: 2000 });
          } catch {
            Alert.alert('Erro', 'Não foi possível encerrar as inscrições.');
          }
        },
      },
    ]);
  };

  const handleStartChampionship = () => {
    if (!isOwner) return;
    if (champMatches.length > 0) {
      Alert.alert('Tabela já gerada', 'As partidas deste campeonato já foram geradas.');
      return;
    }
    if (approvedTeams.length < MIN_TEAMS_TO_START) {
      Alert.alert('Times insuficientes', `É preciso ao menos ${MIN_TEAMS_TO_START} times aprovados.`);
      return;
    }
    Alert.alert(
      'Iniciar campeonato',
      `Gerar a tabela com ${approvedTeams.length} times aprovados e iniciar o campeonato?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Iniciar',
          onPress: async () => {
            setStarting(true);
            try {
              const result = await startChampionship(championship, approvedTeams);
              if (result.success) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Toast.show({
                  type: 'success',
                  text1: 'Campeonato iniciado!',
                  text2: `${result.matchesCreated} partidas geradas.`,
                  visibilityTime: 2500,
                });
                setActiveTab('matches');
              } else {
                Alert.alert('Erro', result.error ?? 'Não foi possível iniciar o campeonato.');
              }
            } finally {
              setStarting(false);
            }
          },
        },
      ],
    );
  };

  const handleFinishChampionship = () => {
    if (!isOwner) return;
    Alert.alert(
      '⚠️ Finalizar campeonato',
      'Esta ação é irreversível. A classificação final será registrada e os participantes notificados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          onPress: () => {
            Alert.alert('Confirmar', `Finalizar oficialmente "${championship.name}"?`, [
              { text: 'Voltar', style: 'cancel' },
              {
                text: 'FINALIZAR',
                style: 'destructive',
                onPress: async () => {
                  setFinishing(true);
                  try {
                    const result = await finishChampionship(championshipId);
                    if (result.success) {
                      updateChampionship(championshipId, {
                        status: 'finalizado',
                        finishedAt: new Date().toISOString(),
                      });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Toast.show({
                        type: 'success',
                        text1: '🏆 Campeonato finalizado!',
                        visibilityTime: 2500,
                      });
                      navigation.getParent()?.navigate({
                        name: TAB_NAMES.INICIO,
                        params: {
                          screen: 'ChampionshipResult',
                          params: { championshipId, readOnly: false },
                        },
                      } as never);
                    } else {
                      Alert.alert('Erro', result.error ?? 'Não foi possível finalizar.');
                    }
                  } finally {
                    setFinishing(false);
                  }
                },
              },
            ]);
          },
        },
      ],
    );
  };

  const handleApprove = async (team: Team) => {
    if (!isOwner || approvingTeamId || rejectingTeamId) return;
    setApprovingTeamId(team.id);
    try {
      await updateDocument('teams', team.id, { status: 'aprovado' });
      updateTeam(team.id, { status: 'aprovado' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Time aprovado!', text2: team.name, visibilityTime: 2000 });
      if (team.captainId) {
        notifyTeamApproved(team.captainId, team.name, championship.name).catch(() => {});
      }
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Erro ao aprovar time', text2: 'Tente novamente', visibilityTime: 2500 });
    } finally {
      setApprovingTeamId(null);
    }
  };

  const handleReject = (team: Team) => {
    if (!isOwner || approvingTeamId || rejectingTeamId) return;
    Alert.alert('Rejeitar time', `Rejeitar "${team.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rejeitar',
        style: 'destructive',
        onPress: async () => {
          setRejectingTeamId(team.id);
          try {
            await updateDocument('teams', team.id, { status: 'rejeitado' });
            updateTeam(team.id, { status: 'rejeitado' });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            Toast.show({ type: 'error', text1: 'Time rejeitado', text2: team.name, visibilityTime: 2000 });
            if (team.captainId) {
              notifyTeamRejected(team.captainId, team.name, championship.name).catch(() => {});
            }
          } catch (error) {
            Toast.show({ type: 'error', text1: 'Erro ao rejeitar time', text2: 'Tente novamente', visibilityTime: 2500 });
          } finally {
            setRejectingTeamId(null);
          }
        },
      },
    ]);
  };

  const handleManageMatch = (match: MatchModel) => {
    // Gestão da partida ao vivo vive na stack da aba Confrontos (rota LiveMatch).
    navigation.getParent()?.navigate({
      name: TAB_NAMES.CONFRONTOS,
      params: { screen: 'LiveMatch', params: { matchId: match.id } },
    } as never);
  };

  const handleDelete = () => {
    if (!isOwner) return;
    Alert.alert(
      '⚠️ Excluir campeonato',
      'Esta ação não pode ser desfeita. O campeonato será removido.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmar exclusão',
              `Tem certeza que deseja excluir "${championship.name}" definitivamente?`,
              [
                { text: 'Voltar', style: 'cancel' },
                {
                  text: 'EXCLUIR',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteDocument('championships', championshipId);
                      removeChampionship(championshipId);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Toast.show({ type: 'success', text1: 'Campeonato excluído', visibilityTime: 2000 });
                      navigation.goBack();
                    } catch {
                      Alert.alert('Erro', 'Não foi possível excluir o campeonato.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  const canStart =
    isOwner && championship.status === 'inscricoes_abertas' && approvedTeams.length >= MIN_TEAMS_TO_START;

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>{championship.name}</Text>
          <Text style={styles.headerSubtitle}>{STATUS_LABELS[championship.status]}</Text>
        </View>
        <View style={styles.backBtn} />
      </SafeAreaView>

      {/* Abas internas (ScrollView horizontal de botões — sem react-native-tab-view) */}
      <View style={styles.tabBarWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBar}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, active && styles.tabBtnTextActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'overview' && (
          <OverviewTab
            championship={championship}
            teamsCount={champTeams.length}
            playersCount={champPlayers.length}
            approvedCount={approvedTeams.length}
            isOwner={isOwner}
            canStart={canStart}
            starting={starting}
            finishing={finishing}
            onEdit={() => setActiveTab('settings')}
            onCloseRegistrations={handleCloseRegistrations}
            onStart={handleStartChampionship}
            onFinish={handleFinishChampionship}
          />
        )}

        {activeTab === 'teams' && (
          <TeamsTab
            teams={champTeams}
            approvedCount={approvedTeams.length}
            isOwner={isOwner}
            approvingTeamId={approvingTeamId}
            rejectingTeamId={rejectingTeamId}
            onApprove={handleApprove}
            onReject={handleReject}
          />
        )}

        {activeTab === 'matches' && (
          <MatchesTab
            matches={champMatches}
            teams={champTeams}
            isOwner={isOwner}
            canStart={canStart}
            starting={starting}
            onGenerate={handleStartChampionship}
            onManage={handleManageMatch}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsTab
            key={championshipId}
            isOwner={isOwner}
            initialName={championship.name}
            initialPoints={{
              win: championship.rules.pointsWin,
              draw: championship.rules.pointsDraw,
              loss: championship.rules.pointsLoss,
            }}
            initialTiebreakers={championship.rules.tiebreakers ?? []}
            initialRegistrationsClosed={!!championship.registrationsClosed}
            initialDeadline={championship.registrationDeadline ?? null}
            rules={championship.rules}
            onSave={persistChampionship}
            onDelete={handleDelete}
          />
        )}
      </ScrollView>
    </View>
  );
}

// ─── Visão Geral ───────────────────────────────────────────────────────────────
function OverviewTab({
  championship,
  teamsCount,
  playersCount,
  approvedCount,
  isOwner,
  canStart,
  starting,
  finishing,
  onEdit,
  onCloseRegistrations,
  onStart,
  onFinish,
}: {
  championship: { format: ChampionshipFormat; status: ChampionshipStatus; totalRounds: number; season?: string; edition?: number; registrationsClosed?: boolean };
  teamsCount: number;
  playersCount: number;
  approvedCount: number;
  isOwner: boolean;
  canStart: boolean;
  starting: boolean;
  finishing: boolean;
  onEdit: () => void;
  onCloseRegistrations: () => void;
  onStart: () => void;
  onFinish: () => void;
}) {
  const seasonLabel = championship.season
    ? `Temporada ${championship.season}${championship.edition ? ` · ${championship.edition}ª edição` : ''}`
    : null;

  return (
    <View>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Formato</Text>
          <Text style={styles.infoValue}>{FORMAT_LABELS[championship.format]}</Text>
        </View>
        <View style={styles.infoRowBorder}>
          <Text style={styles.infoLabel}>Status</Text>
          <Badge label={STATUS_LABELS[championship.status]} variant={STATUS_VARIANT[championship.status]} />
        </View>
        {seasonLabel && (
          <View style={styles.infoRowBorder}>
            <Text style={styles.infoLabel}>Temporada</Text>
            <Text style={styles.infoValue}>{seasonLabel}</Text>
          </View>
        )}
      </View>

      <View style={styles.metricsRow}>
        <Metric icon="shield" value={`${approvedCount}/${teamsCount}`} label="Times aprovados" />
        <Metric icon="people" value={String(playersCount)} label="Atletas" />
        <Metric icon="calendar" value={String(championship.totalRounds)} label="Rodadas" />
      </View>

      {isOwner && (
        <View style={styles.actionsBlock}>
          <AppButton title="Editar Campeonato" variant="outline" fullWidth onPress={onEdit} />

          {championship.status === 'inscricoes_abertas' && !championship.registrationsClosed && (
            <AppButton
              title="Encerrar Inscrições"
              variant="outline"
              fullWidth
              onPress={onCloseRegistrations}
              style={styles.actionGap}
            />
          )}

          {canStart && (
            <AppButton
              title="Iniciar Campeonato"
              fullWidth
              loading={starting}
              onPress={onStart}
              style={styles.actionGap}
            />
          )}

          {championship.status === 'em_andamento' && (
            <AppButton
              title="Finalizar Campeonato"
              variant="danger"
              fullWidth
              loading={finishing}
              onPress={onFinish}
              style={styles.actionGap}
            />
          )}
        </View>
      )}
    </View>
  );
}

function Metric({ icon, value, label }: { icon: keyof typeof Ionicons.glyphMap; value: string; label: string }) {
  return (
    <View style={styles.metricCard}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

// ─── Times ───────────────────────────────────────────────────────────────────
function TeamsTab({
  teams,
  approvedCount,
  isOwner,
  approvingTeamId,
  rejectingTeamId,
  onApprove,
  onReject,
}: {
  teams: Team[];
  approvedCount: number;
  isOwner: boolean;
  approvingTeamId: string | null;
  rejectingTeamId: string | null;
  onApprove: (t: Team) => void;
  onReject: (t: Team) => void;
}) {
  if (teams.length === 0) {
    return (
      <View style={styles.tabEmpty}>
        <MaterialCommunityIcons name="account-group-outline" size={52} color={colors.textMuted} />
        <Text style={styles.tabEmptyText}>Nenhum time inscrito ainda.</Text>
      </View>
    );
  }

  const isProcessing = !!approvingTeamId || !!rejectingTeamId;

  return (
    <View>
      <View style={styles.counterPill}>
        <Ionicons name="checkmark-circle" size={16} color={colors.success} />
        <Text style={styles.counterText}>{approvedCount}/{teams.length} times aprovados</Text>
      </View>

      {teams.map((team) => {
        const variant =
          team.status === 'aprovado' ? 'approved' : team.status === 'rejeitado' ? 'loss' : 'pending';
        const label =
          team.status === 'aprovado' ? 'Aprovado' : team.status === 'rejeitado' ? 'Rejeitado' : 'Pendente';
        const isApproving = approvingTeamId === team.id;
        const isRejecting = rejectingTeamId === team.id;
        return (
          <View key={team.id} style={styles.teamCard}>
            <View style={styles.teamRow}>
              <TeamColorDot color={team.primaryColor} size={12} />
              <Text style={styles.teamName} numberOfLines={1}>{team.name}</Text>
              <Badge label={label} variant={variant} />
            </View>
            {isOwner && team.status === 'pendente' && (
              <View style={styles.teamActions}>
                <AppButton
                  title="Aprovar"
                  variant="success"
                  onPress={() => onApprove(team)}
                  loading={isApproving}
                  disabled={isProcessing && !isApproving}
                  style={styles.teamActionBtn}
                />
                <AppButton
                  title="Rejeitar"
                  variant="danger"
                  onPress={() => onReject(team)}
                  loading={isRejecting}
                  disabled={isProcessing && !isRejecting}
                  style={styles.teamActionBtn}
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ─── Partidas ────────────────────────────────────────────────────────────────
function MatchesTab({
  matches,
  teams,
  isOwner,
  canStart,
  starting,
  onGenerate,
  onManage,
}: {
  matches: MatchModel[];
  teams: Team[];
  isOwner: boolean;
  canStart: boolean;
  starting: boolean;
  onGenerate: () => void;
  onManage: (m: MatchModel) => void;
}) {
  const rounds = useMemo(() => {
    const map = new Map<number, MatchModel[]>();
    matches.forEach((m) => {
      const list = map.get(m.round) ?? [];
      list.push(m);
      map.set(m.round, list);
    });
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches]);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? 'A definir';
  const teamColor = (id: string) => teams.find((t) => t.id === id)?.primaryColor ?? colors.textMuted;

  if (matches.length === 0) {
    return (
      <View style={styles.tabEmpty}>
        <MaterialCommunityIcons name="calendar-blank-outline" size={52} color={colors.textMuted} />
        <Text style={styles.tabEmptyText}>Tabela ainda não gerada.</Text>
        {isOwner && canStart && (
          <AppButton
            title="Gerar Tabela e Iniciar"
            loading={starting}
            onPress={onGenerate}
            style={styles.generateBtn}
          />
        )}
      </View>
    );
  }

  return (
    <View>
      {rounds.map(([round, roundMatches]) => (
        <View key={round} style={styles.roundBlock}>
          <Text style={styles.roundTitle}>Rodada {round}</Text>
          {roundMatches.map((match) => (
            <View key={match.id} style={styles.matchCard}>
              <View style={styles.matchTop}>
                <Badge
                  label={MATCH_STATUS_LABELS[match.status]}
                  variant={MATCH_STATUS_VARIANT[match.status]}
                />
                {isOwner && (
                  <TouchableOpacity
                    style={styles.manageBtn}
                    onPress={() => onManage(match)}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="create-outline" size={15} color={colors.accent} />
                    <Text style={styles.manageBtnText}>Gerenciar</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.matchTeams}>
                <View style={styles.matchTeamLeft}>
                  <TeamColorDot color={teamColor(match.homeTeamId)} size={10} />
                  <Text style={styles.matchTeam} numberOfLines={1}>{teamName(match.homeTeamId)}</Text>
                </View>
                <Text style={styles.matchScore}>
                  {match.status === 'agendado'
                    ? 'vs'
                    : `${match.homeScore ?? 0} × ${match.awayScore ?? 0}`}
                </Text>
                <View style={styles.matchTeamRight}>
                  <Text style={styles.matchTeam} numberOfLines={1}>{teamName(match.awayTeamId)}</Text>
                  <TeamColorDot color={teamColor(match.awayTeamId)} size={10} />
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Configurações ─────────────────────────────────────────────────────────────
function SettingsTab({
  isOwner,
  initialName,
  initialPoints,
  initialTiebreakers,
  initialRegistrationsClosed,
  initialDeadline,
  rules,
  onSave,
  onDelete,
}: {
  isOwner: boolean;
  initialName: string;
  initialPoints: { win: number; draw: number; loss: number };
  initialTiebreakers: string[];
  initialRegistrationsClosed: boolean;
  initialDeadline: string | null;
  rules: ChampionshipRules;
  onSave: (updates: Record<string, unknown>) => Promise<void>;
  onDelete: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [win, setWin] = useState(String(initialPoints.win));
  const [draw, setDraw] = useState(String(initialPoints.draw));
  const [loss, setLoss] = useState(String(initialPoints.loss));
  const [tiebreakers, setTiebreakers] = useState<string[]>(initialTiebreakers);
  const [registrationsClosed, setRegistrationsClosed] = useState(initialRegistrationsClosed);
  const [deadline, setDeadline] = useState<Date | null>(
    initialDeadline ? new Date(initialDeadline) : null,
  );
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const moveTiebreaker = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= tiebreakers.length) return;
    const next = [...tiebreakers];
    [next[index], next[target]] = [next[target], next[index]];
    setTiebreakers(next);
  };

  const onDeadlineChange = (_e: DateTimePickerEvent, selected?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (selected) setDeadline(selected);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Campo obrigatório', 'O nome do campeonato não pode ficar vazio.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        rules: {
          ...rules,
          pointsWin: parseInt(win, 10) || 0,
          pointsDraw: parseInt(draw, 10) || 0,
          pointsLoss: parseInt(loss, 10) || 0,
          tiebreakers,
        },
        registrationsClosed,
        registrationDeadline: deadline ? deadline.toISOString() : null,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Configurações salvas', visibilityTime: 2000 });
    } catch {
      Alert.alert('Erro', 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner) {
    return (
      <View style={styles.tabEmpty}>
        <MaterialCommunityIcons name="lock-outline" size={52} color={colors.textMuted} />
        <Text style={styles.tabEmptyText}>Apenas o organizador pode editar as configurações.</Text>
      </View>
    );
  }

  return (
    <View>
      {/* Nome */}
      <Text style={styles.fieldLabel}>Nome do campeonato</Text>
      <TextInput
        style={styles.textInput}
        value={name}
        onChangeText={setName}
        placeholder="Nome do campeonato"
        placeholderTextColor={colors.textMuted}
      />

      {/* Pontuação */}
      <Text style={styles.fieldLabel}>Pontuação</Text>
      <View style={styles.pointsRow}>
        {[
          { label: 'Vitória', value: win, set: setWin },
          { label: 'Empate', value: draw, set: setDraw },
          { label: 'Derrota', value: loss, set: setLoss },
        ].map(({ label, value, set }) => (
          <View key={label} style={styles.pointCard}>
            <TextInput
              style={styles.pointInput}
              value={value}
              onChangeText={(t) => set(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              maxLength={2}
              selectTextOnFocus
            />
            <Text style={styles.pointLabel}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Critérios de desempate */}
      <Text style={styles.fieldLabel}>Critérios de desempate</Text>
      <View style={styles.tiebreakerCard}>
        {tiebreakers.length === 0 ? (
          <Text style={styles.tabEmptyText}>Nenhum critério definido.</Text>
        ) : (
          tiebreakers.map((key, index) => (
            <View key={key} style={[styles.tiebreakerRow, index > 0 && styles.tiebreakerRowBorder]}>
              <View style={styles.tiebreakerBadge}>
                <Text style={styles.tiebreakerBadgeText}>{index + 1}</Text>
              </View>
              <Text style={styles.tiebreakerLabel}>{TIEBREAKER_LABELS[key] ?? key}</Text>
              <View style={styles.tiebreakerArrows}>
                <TouchableOpacity
                  onPress={() => moveTiebreaker(index, -1)}
                  disabled={index === 0}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="chevron-up"
                    size={20}
                    color={index === 0 ? colors.textMuted : colors.accent}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => moveTiebreaker(index, 1)}
                  disabled={index === tiebreakers.length - 1}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="chevron-down"
                    size={20}
                    color={index === tiebreakers.length - 1 ? colors.textMuted : colors.accent}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Inscrições */}
      <Text style={styles.fieldLabel}>Inscrições</Text>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Inscrições encerradas</Text>
        <Switch
          value={registrationsClosed}
          onValueChange={setRegistrationsClosed}
          trackColor={{ false: colors.bg300, true: colors.accent }}
          thumbColor="#FFFFFF"
          ios_backgroundColor={colors.bg300}
        />
      </View>

      {/* Prazo */}
      <Text style={styles.fieldLabel}>Prazo de inscrição</Text>
      <TouchableOpacity
        style={styles.deadlineBtn}
        onPress={() => setShowPicker(true)}
        activeOpacity={0.8}
      >
        <Ionicons name="calendar-outline" size={18} color={colors.accent} />
        <Text style={[styles.deadlineText, !deadline && styles.deadlinePlaceholder]}>
          {deadline
            ? deadline.toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Sem prazo definido'}
        </Text>
        {deadline && (
          <TouchableOpacity onPress={() => setDeadline(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={deadline ?? new Date()}
          mode={Platform.OS === 'ios' ? 'datetime' : 'date'}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={new Date()}
          onChange={onDeadlineChange}
        />
      )}

      <AppButton
        title="Salvar alterações"
        fullWidth
        loading={saving}
        onPress={handleSave}
        style={styles.saveBtn}
      />

      {/* Zona de perigo */}
      <View style={styles.dangerZone}>
        <View style={styles.dangerHeader}>
          <Ionicons name="warning-outline" size={18} color={colors.danger} />
          <Text style={styles.dangerTitle}>Zona de perigo</Text>
        </View>
        <Text style={styles.dangerDesc}>
          Excluir o campeonato remove-o permanentemente da sua lista.
        </Text>
        <AppButton title="Excluir Campeonato" variant="danger" fullWidth onPress={onDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    backgroundColor: HEADER_DARK,
    paddingHorizontal: 12,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textOnDark,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  missingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  missingText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textSecondary,
  },

  // Tab bar
  tabBarWrap: {
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bg300,
  },
  tabBtnActive: {
    backgroundColor: colors.accent,
  },
  tabBtnText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.textOnAccent,
    fontFamily: 'Barlow-SemiBold',
  },

  body: {
    flex: 1,
  },
  bodyContent: {
    padding: 20,
    paddingBottom: 60,
  },

  // Overview
  infoCard: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  infoRowBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
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
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  metricCard: {
    flex: 1,
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 22,
    color: colors.textPrimary,
  },
  metricLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  actionsBlock: {
    marginTop: 24,
  },
  actionGap: {
    marginTop: 12,
  },

  // Teams
  counterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: colors.bg200,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  counterText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textPrimary,
  },
  teamCard: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamName: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  teamActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  teamActionBtn: {
    flex: 1,
    height: 40,
    alignSelf: 'stretch',
  },

  // Matches
  roundBlock: {
    marginBottom: 18,
  },
  roundTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    letterSpacing: 1.5,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  matchCard: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 10,
  },
  matchTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentGlow,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  manageBtnText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.accent,
  },
  matchTeams: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  matchTeamLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  matchTeamRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  matchTeam: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
  },
  matchScore: {
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
    minWidth: 44,
    textAlign: 'center',
  },
  generateBtn: {
    marginTop: 8,
  },

  // Shared empty
  tabEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 14,
  },
  tabEmptyText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Settings
  fieldLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    letterSpacing: 1.2,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 18,
  },
  textInput: {
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 50,
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textPrimary,
  },
  pointsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  pointCard: {
    flex: 1,
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  pointInput: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
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
  tiebreakerCard: {
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  tiebreakerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  tiebreakerRowBorder: {
    borderTopWidth: 0.5,
    borderTopColor: colors.border,
  },
  tiebreakerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
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
  tiebreakerArrows: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  toggleLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 15,
    color: colors.textPrimary,
  },
  deadlineBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  deadlineText: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textPrimary,
  },
  deadlinePlaceholder: {
    color: colors.textMuted,
  },
  saveBtn: {
    marginTop: 24,
  },
  dangerZone: {
    marginTop: 32,
    backgroundColor: 'rgba(255,59,71,0.06)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,59,71,0.3)',
    padding: 16,
  },
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  dangerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.danger,
  },
  dangerDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 14,
    lineHeight: 18,
  },
});
