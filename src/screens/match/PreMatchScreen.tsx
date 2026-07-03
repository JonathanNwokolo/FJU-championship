import { useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';
import { Badge } from '../../components/Badge';
import { TeamColorDot } from '../../components/TeamColorDot';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { MatchModel, Player, Team } from '../../types';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import { POSITION_LABELS, POSITION_COLORS } from '../../utils/constants';
import { getSuspendedPlayers } from '../../services/statsService';
import { isActiveRosterPlayer } from '../../utils/teamRules';
import {
  MatchStatusActionsSheet,
  MatchStatusActionsSheetRef,
} from '../../components/MatchStatusActionsSheet';
import { MatchConvocationPanel } from '../../components/MatchConvocationPanel';

type RouteT = RouteProp<FixturesStackParamList, 'PreMatch'>;
type NavT = NativeStackNavigationProp<FixturesStackParamList>;

type FormResult = 'V' | 'E' | 'D';

function formatScheduledAt(value?: string | null): string {
  if (!value) return 'Data a definir';
  try {
    const d = new Date(value);
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleDateString('pt-BR', { month: 'long' });
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    return `${cap}, ${day} de ${month} · ${h}h${m}`;
  } catch {
    return value;
  }
}

function getMatchResult(match: MatchModel, teamId: string): FormResult {
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  if (homeScore === awayScore) return 'E';
  const won =
    (match.homeTeamId === teamId && homeScore > awayScore) ||
    (match.awayTeamId === teamId && awayScore > homeScore);
  return won ? 'V' : 'D';
}

function getTeamForm(matches: MatchModel[], teamId: string): FormResult[] {
  return matches
    .filter(
      (match) =>
        match.status === 'finalizado' &&
        (match.homeTeamId === teamId || match.awayTeamId === teamId),
    )
    .slice()
    .sort((a, b) => b.round - a.round)
    .slice(0, 5)
    .map((match) => getMatchResult(match, teamId));
}

// ─── Form Dots Component ─────────────────────────────────────────────────────

function FormDots({ form }: { form: FormResult[] }) {
  if (form.length === 0) {
    return <Text style={styles.noFormText}>Sem jogos</Text>;
  }
  return (
    <View style={styles.formDots}>
      {form.map((result, index) => (
        <View
          key={`${result}-${index}`}
          style={[
            styles.formDot,
            result === 'V' && styles.formWin,
            result === 'E' && styles.formDraw,
            result === 'D' && styles.formLoss,
          ]}
        >
          <Text style={styles.formDotText}>{result}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Player Row Component ────────────────────────────────────────────────────

interface PlayerRowProps {
  player: Player;
  isSuspended: boolean;
  isRight?: boolean;
}

function PlayerRow({ player, isSuspended, isRight }: PlayerRowProps) {
  const posColor = POSITION_COLORS[player.position] ?? colors.textMuted;
  
  return (
    <View style={[styles.playerRow, isRight && styles.playerRowRight]}>
      {isRight && isSuspended && <Text style={styles.suspendedIcon}>🚫</Text>}
      <Text style={[styles.playerNumber, isSuspended && styles.suspendedText]}>
        #{player.number}
      </Text>
      <Text 
        style={[styles.playerName, isSuspended && styles.suspendedText]} 
        numberOfLines={1}
      >
        {player.name}
      </Text>
      <View style={[styles.positionPill, { backgroundColor: `${posColor}22` }]}>
        <Text style={[styles.positionText, { color: posColor }]}>
          {POSITION_LABELS[player.position]?.substring(0, 3).toUpperCase() ?? '???'}
        </Text>
      </View>
      {!isRight && isSuspended && <Text style={styles.suspendedIcon}>🚫</Text>}
    </View>
  );
}

// ─── Head to Head Match Row ──────────────────────────────────────────────────

interface H2HMatchRowProps {
  match: MatchModel;
  homeTeam?: Team;
  awayTeam?: Team;
}

function H2HMatchRow({ match, homeTeam, awayTeam }: H2HMatchRowProps) {
  const dateStr = match.finishedAt 
    ? new Date(match.finishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : `Rodada ${match.round}`;
  
  return (
    <View style={styles.h2hRow}>
      <View style={styles.h2hTeamCol}>
        <TeamColorDot color={homeTeam?.primaryColor} size={8} />
        <Text style={styles.h2hTeamName} numberOfLines={1}>
          {homeTeam?.name ?? 'Time A'}
        </Text>
      </View>
      <View style={styles.h2hScoreCol}>
        <Text style={styles.h2hScore}>
          {match.homeScore ?? 0} - {match.awayScore ?? 0}
        </Text>
        <Text style={styles.h2hDate}>{dateStr}</Text>
      </View>
      <View style={[styles.h2hTeamCol, styles.h2hTeamColRight]}>
        <Text style={[styles.h2hTeamName, { textAlign: 'right' }]} numberOfLines={1}>
          {awayTeam?.name ?? 'Time B'}
        </Text>
        <TeamColorDot color={awayTeam?.primaryColor} size={8} />
      </View>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function PreMatchScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { matchId } = route.params;

  const user = useAuthStore((s) => s.user);
  const matches = useMatchStore((s) => s.matches);
  const events = useMatchStore((s) => s.events);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const championships = useChampionshipStore((s) => s.championships);

  const match = matches.find((m) => m.id === matchId);
  const homeTeam = teams.find((t) => t.id === match?.homeTeamId);
  const awayTeam = teams.find((t) => t.id === match?.awayTeamId);
  const championship = championships.find((c) => c.id === match?.championshipId);
  const isOrganizer =
    user?.role === 'organizador' && championship?.organizerId === user?.id;

  const statusSheetRef = useRef<MatchStatusActionsSheetRef>(null);

  // Get players for each team (sorted: goalkeepers first, then by number).
  // Apenas elenco ATUAL: sem_time/removido mantêm o teamId antigo no doc e não
  // podem aparecer na escalação.
  const homePlayers = useMemo(() => {
    return players
      .filter((p) => p.teamId === match?.homeTeamId && isActiveRosterPlayer(p))
      .sort((a, b) => {
        if (a.position === 'goleiro' && b.position !== 'goleiro') return -1;
        if (a.position !== 'goleiro' && b.position === 'goleiro') return 1;
        return a.number - b.number;
      });
  }, [players, match?.homeTeamId]);

  const awayPlayers = useMemo(() => {
    return players
      .filter((p) => p.teamId === match?.awayTeamId && isActiveRosterPlayer(p))
      .sort((a, b) => {
        if (a.position === 'goleiro' && b.position !== 'goleiro') return -1;
        if (a.position !== 'goleiro' && b.position === 'goleiro') return 1;
        return a.number - b.number;
      });
  }, [players, match?.awayTeamId]);

  // Get suspended players
  const suspendedPlayers = useMemo(() => {
    if (!championship) return new Set<string>();
    const suspended = getSuspendedPlayers(matches, events, players, teams, championship.rules);
    return new Set(suspended.map((s) => s.playerId));
  }, [matches, events, players, teams, championship]);

  // Head-to-head history
  const headToHead = useMemo(() => {
    if (!match) return [];
    return matches
      .filter(
        (m) =>
          m.status === 'finalizado' &&
          ((m.homeTeamId === match.homeTeamId && m.awayTeamId === match.awayTeamId) ||
            (m.homeTeamId === match.awayTeamId && m.awayTeamId === match.homeTeamId)),
      )
      .sort((a, b) => b.round - a.round)
      .slice(0, 3);
  }, [matches, match]);

  // H2H summary
  const h2hSummary = useMemo(() => {
    if (!match) return { homeWins: 0, draws: 0, awayWins: 0 };
    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;

    for (const m of headToHead) {
      const homeScore = m.homeScore ?? 0;
      const awayScore = m.awayScore ?? 0;
      
      if (homeScore === awayScore) {
        draws++;
      } else if (
        (m.homeTeamId === match.homeTeamId && homeScore > awayScore) ||
        (m.awayTeamId === match.homeTeamId && awayScore > homeScore)
      ) {
        homeWins++;
      } else {
        awayWins++;
      }
    }
    return { homeWins, draws, awayWins };
  }, [headToHead, match]);

  // Team forms (last 5 matches)
  const homeForm = useMemo(
    () => getTeamForm(matches, match?.homeTeamId ?? ''),
    [matches, match?.homeTeamId],
  );
  const awayForm = useMemo(
    () => getTeamForm(matches, match?.awayTeamId ?? ''),
    [matches, match?.awayTeamId],
  );

  // Team positions in standings
  const homePosition = useMemo(() => {
    const champMatches = matches.filter((m) => m.championshipId === match?.championshipId);
    const finishedMatches = champMatches.filter((m) => m.status === 'finalizado');
    if (!finishedMatches.length) return null;
    
    // Simple points calculation
    const pointsMap: Record<string, number> = {};
    for (const m of finishedMatches) {
      const hs = m.homeScore ?? 0;
      const as = m.awayScore ?? 0;
      if (!pointsMap[m.homeTeamId]) pointsMap[m.homeTeamId] = 0;
      if (!pointsMap[m.awayTeamId]) pointsMap[m.awayTeamId] = 0;
      
      if (hs > as) pointsMap[m.homeTeamId] += 3;
      else if (as > hs) pointsMap[m.awayTeamId] += 3;
      else {
        pointsMap[m.homeTeamId] += 1;
        pointsMap[m.awayTeamId] += 1;
      }
    }
    
    const sorted = Object.entries(pointsMap).sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([id]) => id === match?.homeTeamId);
    return idx >= 0 ? idx + 1 : null;
  }, [matches, match]);

  const awayPosition = useMemo(() => {
    const champMatches = matches.filter((m) => m.championshipId === match?.championshipId);
    const finishedMatches = champMatches.filter((m) => m.status === 'finalizado');
    if (!finishedMatches.length) return null;
    
    const pointsMap: Record<string, number> = {};
    for (const m of finishedMatches) {
      const hs = m.homeScore ?? 0;
      const as = m.awayScore ?? 0;
      if (!pointsMap[m.homeTeamId]) pointsMap[m.homeTeamId] = 0;
      if (!pointsMap[m.awayTeamId]) pointsMap[m.awayTeamId] = 0;
      
      if (hs > as) pointsMap[m.homeTeamId] += 3;
      else if (as > hs) pointsMap[m.awayTeamId] += 3;
      else {
        pointsMap[m.homeTeamId] += 1;
        pointsMap[m.awayTeamId] += 1;
      }
    }
    
    const sorted = Object.entries(pointsMap).sort((a, b) => b[1] - a[1]);
    const idx = sorted.findIndex(([id]) => id === match?.awayTeamId);
    return idx >= 0 ? idx + 1 : null;
  }, [matches, match]);

  const handleStartRegistration = () => {
    navigation.replace('MatchRegistration', { matchId });
  };

  if (!match) return null;

  const isLive = match.status === 'ao_vivo';
  const isScheduled = match.status === 'agendado';
  const isPostponed = match.status === 'adiado';
  const statusBadge = isLive ? (
    <Badge label="AO VIVO" variant="live" />
  ) : match.status === 'adiado' ? (
    <Badge label="ADIADO" variant="pending" />
  ) : match.status === 'cancelado' ? (
    <Badge label="CANCELADO" variant="loss" />
  ) : match.status === 'wo' ? (
    <Badge label="W.O." variant="approved" />
  ) : match.status === 'finalizado' ? (
    <Badge label="FINALIZADO" variant="approved" />
  ) : (
    <Badge label="AGENDADO" variant="pending" />
  );

  const openStatusAction = (action: 'wo' | 'adiar' | 'cancelar' | 'reativar') => {
    if (!championship) return;
    statusSheetRef.current?.open(action, match, championship, homeTeam, awayTeam);
  };

  return (
    <View style={styles.container}>
      {/* Hero Header */}
      <LinearGradient
        colors={[colors.primaryDark, colors.primary]}
        style={styles.heroGradient}
      >
        <SafeAreaView edges={['top']} style={styles.heroSafe}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textOnDark} />
          </TouchableOpacity>

          <View style={styles.heroContent}>
            <Text style={styles.roundLabel}>RODADA {match.round}</Text>
            
            <View style={styles.teamsRow}>
              <View style={styles.teamBlock}>
                <View style={[styles.teamColorBar, { backgroundColor: homeTeam?.primaryColor }]} />
                <Text style={styles.teamName} numberOfLines={2}>
                  {homeTeam?.name ?? 'Time Casa'}
                </Text>
              </View>
              
              <Text style={styles.vsText}>VS</Text>
              
              <View style={[styles.teamBlock, styles.teamBlockRight]}>
                <Text style={[styles.teamName, styles.teamNameRight]} numberOfLines={2}>
                  {awayTeam?.name ?? 'Time Fora'}
                </Text>
                <View style={[styles.teamColorBar, { backgroundColor: awayTeam?.primaryColor }]} />
              </View>
            </View>

            {statusBadge}

            {match.scheduledAt && (
              <View style={styles.scheduleRow}>
                <Ionicons name="calendar-outline" size={14} color={colors.accent} />
                <Text style={styles.scheduleText}>
                  {formatScheduledAt(match.scheduledAt)}
                </Text>
              </View>
            )}

            {match.location && (
              <View style={styles.scheduleRow}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.locationText}>{match.location}</Text>
              </View>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Lineups Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⚽ Escalações</Text>
          <AppCard style={styles.lineupsCard}>
            <View style={styles.lineupsHeader}>
              <View style={styles.lineupHeaderLeft}>
                <TeamColorDot color={homeTeam?.primaryColor} size={10} />
                <Text style={styles.lineupTeamName} numberOfLines={1}>
                  {homeTeam?.name}
                </Text>
              </View>
              <View style={styles.lineupHeaderRight}>
                <Text style={[styles.lineupTeamName, { textAlign: 'right' }]} numberOfLines={1}>
                  {awayTeam?.name}
                </Text>
                <TeamColorDot color={awayTeam?.primaryColor} size={10} />
              </View>
            </View>

            <View style={styles.lineupsBody}>
              <View style={styles.lineupCol}>
                {homePlayers.map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    isSuspended={suspendedPlayers.has(p.id)}
                  />
                ))}
                {homePlayers.length === 0 && (
                  <Text style={styles.noPlayersText}>Sem jogadores cadastrados</Text>
                )}
              </View>

              <View style={styles.lineupDivider} />

              <View style={styles.lineupCol}>
                {awayPlayers.map((p) => (
                  <PlayerRow
                    key={p.id}
                    player={p}
                    isSuspended={suspendedPlayers.has(p.id)}
                    isRight
                  />
                ))}
                {awayPlayers.length === 0 && (
                  <Text style={styles.noPlayersText}>Sem jogadores cadastrados</Text>
                )}
              </View>
            </View>
          </AppCard>
        </View>

        {/* Convocação e presença (Bloco 5 — Fase B) */}
        {championship && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Convocação e presença</Text>
            <MatchConvocationPanel
              match={match}
              championship={championship}
              homeTeam={homeTeam}
              awayTeam={awayTeam}
              players={players}
              allMatches={matches}
              events={events}
              teams={teams}
              userId={user?.id ?? ''}
            />
          </View>
        )}

        {/* Head to Head Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Histórico de Confrontos</Text>
          <AppCard style={styles.h2hCard}>
            {headToHead.length > 0 ? (
              <>
                {headToHead.map((m) => (
                  <H2HMatchRow
                    key={m.id}
                    match={m}
                    homeTeam={teams.find((t) => t.id === m.homeTeamId)}
                    awayTeam={teams.find((t) => t.id === m.awayTeamId)}
                  />
                ))}
                <View style={styles.h2hSummary}>
                  <View style={styles.h2hSummaryItem}>
                    <Text style={styles.h2hSummaryValue}>{h2hSummary.homeWins}</Text>
                    <Text style={styles.h2hSummaryLabel}>{homeTeam?.name?.split(' ')[0] ?? 'Casa'}</Text>
                  </View>
                  <View style={styles.h2hSummaryItem}>
                    <Text style={styles.h2hSummaryValue}>{h2hSummary.draws}</Text>
                    <Text style={styles.h2hSummaryLabel}>Empates</Text>
                  </View>
                  <View style={styles.h2hSummaryItem}>
                    <Text style={styles.h2hSummaryValue}>{h2hSummary.awayWins}</Text>
                    <Text style={styles.h2hSummaryLabel}>{awayTeam?.name?.split(' ')[0] ?? 'Fora'}</Text>
                  </View>
                </View>
              </>
            ) : (
              <Text style={styles.noH2HText}>
                Primeiro confronto entre as equipes
              </Text>
            )}
          </AppCard>
        </View>

        {/* Current Form Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📈 Momento Atual</Text>
          <AppCard style={styles.formCard}>
            <View style={styles.formRow}>
              <View style={styles.formTeamBlock}>
                <View style={styles.formTeamHeader}>
                  <TeamColorDot color={homeTeam?.primaryColor} size={10} />
                  <Text style={styles.formTeamName} numberOfLines={1}>
                    {homeTeam?.name}
                  </Text>
                </View>
                {homePosition && (
                  <Text style={styles.formPosition}>{homePosition}º lugar</Text>
                )}
                <Text style={styles.formSubtitle}>Últimas 5</Text>
                <FormDots form={homeForm} />
              </View>

              <View style={styles.formDivider} />

              <View style={styles.formTeamBlock}>
                <View style={styles.formTeamHeader}>
                  <TeamColorDot color={awayTeam?.primaryColor} size={10} />
                  <Text style={styles.formTeamName} numberOfLines={1}>
                    {awayTeam?.name}
                  </Text>
                </View>
                {awayPosition && (
                  <Text style={styles.formPosition}>{awayPosition}º lugar</Text>
                )}
                <Text style={styles.formSubtitle}>Últimas 5</Text>
                <FormDots form={awayForm} />
              </View>
            </View>
          </AppCard>
        </View>

        {/* Bottom padding for FAB */}
        {isOrganizer && <View style={{ height: 160 }} />}
      </ScrollView>

      {/* Organizer actions */}
      {isOrganizer && (isScheduled || isPostponed || isLive) && (
        <View style={styles.fabContainer}>
          {(isScheduled || isLive) && (
            <AppButton
              title={isLive ? 'Continuar registro' : 'Iniciar registro da partida'}
              onPress={handleStartRegistration}
              fullWidth
            />
          )}
          {isPostponed && (
            <AppButton
              title="Reativar partida"
              onPress={() => openStatusAction('reativar')}
              fullWidth
            />
          )}
          <View style={styles.statusActionsRow}>
            {(isScheduled || isPostponed) && (
              <>
                {isScheduled && (
                  <TouchableOpacity
                    style={styles.statusActionBtn}
                    onPress={() => openStatusAction('adiar')}
                  >
                    <Ionicons name="calendar-outline" size={16} color={colors.accent} />
                    <Text style={styles.statusActionText}>Adiar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.statusActionBtn}
                  onPress={() => openStatusAction('wo')}
                >
                  <Ionicons name="ribbon-outline" size={16} color={colors.accent} />
                  <Text style={styles.statusActionText}>W.O.</Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={[styles.statusActionBtn, styles.statusActionDanger]}
              onPress={() => openStatusAction('cancelar')}
            >
              <Ionicons name="close-circle-outline" size={16} color={colors.danger} />
              <Text style={[styles.statusActionText, styles.statusActionDangerText]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {isOrganizer && (
        <MatchStatusActionsSheet ref={statusSheetRef} organizerId={user!.id} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  heroGradient: {
    paddingBottom: 24,
  },
  heroSafe: {
    paddingHorizontal: 20,
  },
  backBtn: {
    marginTop: 8,
    marginBottom: 12,
    width: 40,
  },
  heroContent: {
    alignItems: 'center',
    gap: 12,
  },
  roundLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 1,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  teamBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamBlockRight: {
    justifyContent: 'flex-end',
  },
  teamColorBar: {
    width: 4,
    height: 40,
    borderRadius: 2,
  },
  teamName: {
    flex: 1,
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.textOnDark,
    lineHeight: 22,
  },
  teamNameRight: {
    textAlign: 'right',
  },
  vsText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textMuted,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  scheduleText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.accent,
  },
  locationText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textMuted,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 20,
    gap: 20,
  },
  section: {
    paddingHorizontal: 20,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  // Lineups
  lineupsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  lineupsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lineupHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lineupHeaderRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  lineupTeamName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
    flex: 1,
  },
  lineupsBody: {
    flexDirection: 'row',
    padding: 12,
  },
  lineupCol: {
    flex: 1,
    gap: 8,
  },
  lineupDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  playerRowRight: {
    justifyContent: 'flex-end',
  },
  playerNumber: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.textSecondary,
    width: 24,
  },
  playerName: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  positionPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  positionText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
  },
  suspendedText: {
    color: colors.danger,
    textDecorationLine: 'line-through',
  },
  suspendedIcon: {
    fontSize: 12,
    marginHorizontal: 4,
  },
  noPlayersText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 16,
  },
  // H2H
  h2hCard: {
    padding: 16,
    gap: 12,
  },
  h2hRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  h2hTeamCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  h2hTeamColRight: {
    justifyContent: 'flex-end',
  },
  h2hTeamName: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  h2hScoreCol: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  h2hScore: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  h2hDate: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
  h2hSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  h2hSummaryItem: {
    alignItems: 'center',
    gap: 2,
  },
  h2hSummaryValue: {
    fontFamily: 'Barlow-Bold',
    fontSize: 24,
    color: colors.accent,
  },
  h2hSummaryLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textSecondary,
  },
  noH2HText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  // Form
  formCard: {
    padding: 16,
  },
  formRow: {
    flexDirection: 'row',
  },
  formTeamBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  formTeamHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formTeamName: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  formPosition: {
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: colors.accent,
  },
  formSubtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  formDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  formDots: {
    flexDirection: 'row',
    gap: 4,
  },
  formDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formDotText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.textOnDark,
  },
  formWin: {
    backgroundColor: colors.success,
  },
  formDraw: {
    backgroundColor: colors.textMuted,
  },
  formLoss: {
    backgroundColor: colors.danger,
  },
  noFormText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
  },
  // FAB
  fabContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: colors.bg100,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  statusActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statusActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusActionText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.accent,
  },
  statusActionDanger: {
    borderColor: 'rgba(255,59,71,0.4)',
  },
  statusActionDangerText: {
    color: colors.danger,
  },
});
