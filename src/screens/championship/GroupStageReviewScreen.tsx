import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp, NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { useMatchStore } from '../../stores/matchStore';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { TeamColorDot } from '../../components/TeamColorDot';
import { colors } from '../../theme/colors';
import { FixturesStackParamList } from '../../navigation/FixturesStackNavigator';
import {
  completeGroupStageAndGenerateKnockout,
  GroupStageTransitionError,
} from '../../services/index';
import { refreshGroupStageData } from '../../services/championshipRefresh';
import { buildGroupStageReview, type ReviewTeamRef } from '../../utils/groupStageReview';
import {
  BYE_QUALIFIER_LABEL,
  getBlockerLabel,
  getGroupServiceErrorMessage,
  getTiebreakReasonLabel,
  isNotableTiebreak,
  getWarningLabel,
  summarizeGroupStageDashboard,
} from '../../utils/groupStagePresentation';

type NavT = NavigationProp<FixturesStackParamList>;
type RouteT = RouteProp<FixturesStackParamList, 'GroupStageReview'>;

// Códigos tipados que significam "outro organizador já concluiu" (§9).
const ALREADY_COMPLETED_CODES = new Set([
  'group_stage_already_completed',
  'transition_log_conflict',
  'knockout_already_generated',
]);

function extractErrorCode(error: unknown): string | null {
  if (error instanceof GroupStageTransitionError) return error.code;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

function QualifierRow({ ref, qualified }: { ref: ReviewTeamRef; qualified: boolean }) {
  const tiebreak = isNotableTiebreak(ref.tiebreakReason)
    ? getTiebreakReasonLabel(ref.tiebreakReason)
    : null;
  return (
    <View
      style={[styles.teamRow, qualified && styles.teamRowQualified]}
      accessibilityLabel={
        `${ref.originLabel}, ${ref.teamName}, ${ref.points} pontos. ` +
        `${qualified ? 'Classificado' : 'Eliminado'}.`
      }
    >
      <Text style={[styles.origin, qualified && styles.originQualified]}>{ref.originLabel}</Text>
      <TeamColorDot color={ref.primaryColor ?? colors.textMuted} size={9} />
      <Text style={styles.teamName} numberOfLines={1}>
        {ref.teamName}
      </Text>
      {tiebreak ? <Text style={styles.tiebreak}>{tiebreak}</Text> : null}
      <Text style={styles.points}>{ref.points} pts</Text>
    </View>
  );
}

export function GroupStageReviewScreen() {
  const navigation = useNavigation<NavT>();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;

  const championships = useChampionshipStore((s) => s.championships);
  const loading = useChampionshipStore((s) => s.loading);
  const championship = championships.find((c) => c.id === championshipId);
  const user = useAuthStore((s) => s.user);
  const allTeams = useTeamStore((s) => s.teams);
  const allMatches = useMatchStore((s) => s.matches);
  const allEvents = useMatchStore((s) => s.events);

  const isOrganizer = user?.role === 'organizador' && championship?.organizerId === user?.id;

  const [submitting, setSubmitting] = useState(false);

  const teams = useMemo(
    () => allTeams.filter((t) => t.championshipId === championshipId),
    [allTeams, championshipId],
  );
  const matches = useMemo(
    () => allMatches.filter((m) => m.championshipId === championshipId),
    [allMatches, championshipId],
  );
  const events = useMemo(
    () => allEvents.filter((e) => e.championshipId === championshipId),
    [allEvents, championshipId],
  );

  const summary = useMemo(
    () => (championship ? summarizeGroupStageDashboard(championship, teams, matches) : null),
    [championship, teams, matches],
  );

  const review = useMemo(
    () => (championship ? buildGroupStageReview({ championship, teams, matches, events }) : null),
    [championship, teams, matches, events],
  );

  const header = (
    <SafeAreaView style={styles.header} edges={['top']}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Voltar"
      >
        <Ionicons name="chevron-back" size={26} color={colors.accent} />
      </TouchableOpacity>
      <Text style={styles.title}>Revisar classificados</Text>
      <View style={styles.backBtn} />
    </SafeAreaView>
  );

  if (loading && !championship) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.skeletonWrap}>
          {[0, 1].map((i) => (
            <SkeletonLoader key={i} width="100%" height={140} borderRadius={16} />
          ))}
        </View>
      </View>
    );
  }

  if (!championship || summary?.isGroupsFormat !== true || !review) {
    return (
      <View style={styles.root}>
        {header}
        <EmptyState
          icon="📋"
          title="Sem fase de grupos"
          description="Este campeonato não usa o formato de grupos + mata-mata."
        />
      </View>
    );
  }

  // Já concluído: leva para a chave existente em vez de oferecer conclusão.
  if (summary.hasGeneratedKnockout) {
    return (
      <View style={styles.root}>
        {header}
        <EmptyState
          icon="🏆"
          title="Fase concluída"
          description="O mata-mata já foi gerado. Veja a chave nas partidas eliminatórias."
        />
        <TouchableOpacity
          style={styles.bracketLink}
          onPress={() => navigation.navigate('FixturesMain')}
          accessibilityRole="button"
          accessibilityLabel="Ver chave do mata-mata"
        >
          <Ionicons name="git-network-outline" size={18} color={colors.accent} />
          <Text style={styles.bracketLinkText}>Ver chave do mata-mata</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const canConfirm = isOrganizer && review.allowed && !submitting;

  const handleComplete = () => {
    if (!isOrganizer || !user?.id) return;
    if (submitting) return; // trava de toque duplo
    if (!review.allowed) return;

    Alert.alert(
      'Concluir fase de grupos',
      'A classificação será congelada e o mata-mata será gerado automaticamente. ' +
        'Esta ação não pode ser desfeita nesta versão.\n\nDeseja continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Concluir e gerar mata-mata',
          style: 'default',
          onPress: async () => {
            if (submitting) return;
            setSubmitting(true);
            try {
              const result = await completeGroupStageAndGenerateKnockout({
                championshipId,
                organizerId: user.id,
                expectedGroupGenerationVersion: championship.groupGenerationVersion ?? 0,
                expectedGroupFixturesVersion: championship.groupFixturesVersion ?? 0,
              });
              await refreshGroupStageData(championshipId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Toast.show({
                type: 'success',
                text1: result.idempotent ? 'Mata-mata já gerado' : 'Mata-mata gerado!',
                text2: 'A chave está pronta.',
                visibilityTime: 2500,
              });
              navigation.navigate('FixturesMain');
            } catch (error) {
              const code = extractErrorCode(error);
              if (code && ALREADY_COMPLETED_CODES.has(code)) {
                // §9: concorrência — não sobrescreve, atualiza e vai para a chave.
                await refreshGroupStageData(championshipId).catch(() => {});
                Toast.show({
                  type: 'info',
                  text1: 'Fase já concluída',
                  text2: 'Outro organizador gerou o mata-mata.',
                  visibilityTime: 2500,
                });
                navigation.navigate('FixturesMain');
                return;
              }
              Alert.alert('Não foi possível concluir', getGroupServiceErrorMessage(code));
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  };

  const groupAQualifiers = review.qualifiers.filter((q) => q.groupId === 'A');
  const groupBQualifiers = review.qualifiers.filter((q) => q.groupId === 'B');
  const groupAEliminated = review.eliminated.filter((q) => q.groupId === 'A');
  const groupBEliminated = review.eliminated.filter((q) => q.groupId === 'B');

  return (
    <View style={styles.root}>
      {header}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Resumo */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>
            {review.qualifierCount} classificados · {review.qualifiersPerGroup} por grupo
          </Text>
          <Text style={styles.summarySub}>
            {review.resolvedMatchCount} de {review.expectedMatchCount} partidas concluídas
          </Text>
        </View>

        {review.standingsError && (
          <View style={styles.blockerCard}>
            <Ionicons name="alert-circle" size={18} color={colors.danger} />
            <Text style={styles.blockerText}>
              Não foi possível montar a classificação agora. Recarregue mais tarde.
            </Text>
          </View>
        )}

        {/* Classificados por grupo */}
        {(['A', 'B'] as const).map((groupId) => {
          const qualifiers = groupId === 'A' ? groupAQualifiers : groupBQualifiers;
          const eliminated = groupId === 'A' ? groupAEliminated : groupBEliminated;
          if (qualifiers.length === 0 && eliminated.length === 0) return null;
          return (
            <View key={groupId} style={styles.groupCard}>
              <Text style={styles.groupTitle}>Grupo {groupId}</Text>
              {qualifiers.map((ref) => (
                <QualifierRow key={ref.teamId} ref={ref} qualified />
              ))}
              {eliminated.length > 0 && (
                <>
                  <Text style={styles.eliminatedLabel}>Eliminados</Text>
                  {eliminated.map((ref) => (
                    <QualifierRow key={ref.teamId} ref={ref} qualified={false} />
                  ))}
                </>
              )}
            </View>
          );
        })}

        {/* Cruzamentos previstos */}
        {review.crossings && review.crossings.length > 0 && (
          <View style={styles.groupCard}>
            <Text style={styles.groupTitle}>Cruzamentos previstos</Text>
            {review.crossings.map((crossing) => (
              <View key={crossing.slot} style={styles.crossingRow}>
                {crossing.isBye ? (
                  <>
                    <Text style={styles.crossingTeam} numberOfLines={1}>
                      {(crossing.home ?? crossing.away)?.teamName}
                    </Text>
                    <Text style={styles.byeText}>{BYE_QUALIFIER_LABEL}</Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.crossingTeam} numberOfLines={1}>
                      {crossing.home?.teamName ?? '—'}
                    </Text>
                    <Text style={styles.crossingVs}>×</Text>
                    <Text style={[styles.crossingTeam, styles.crossingTeamRight]} numberOfLines={1}>
                      {crossing.away?.teamName ?? '—'}
                    </Text>
                  </>
                )}
              </View>
            ))}
            {review.hasBye && (
              <Text style={styles.byeHint}>
                Há {review.byeCount} BYE estrutural. Times com BYE avançam sem jogar a primeira fase.
              </Text>
            )}
          </View>
        )}

        {/* Warnings (não bloqueiam) */}
        {review.warnings.length > 0 && (
          <View style={styles.warningCard}>
            {review.warnings.map((warning, index) => (
              <View key={`${warning.code}-${index}`} style={styles.warningRow}>
                <Ionicons name="information-circle-outline" size={16} color={colors.warning} />
                <Text style={styles.warningText}>{getWarningLabel(warning)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Blockers (impedem a conclusão) */}
        {review.blockers.length > 0 && (
          <View style={styles.blockerCard}>
            <View style={styles.blockerHeader}>
              <Ionicons name="lock-closed" size={16} color={colors.danger} />
              <Text style={styles.blockerHeaderText}>Pendências que impedem concluir</Text>
            </View>
            {review.blockers.map((blocker, index) => (
              <Text key={`${blocker.code}-${index}`} style={styles.blockerItem}>
                • {getBlockerLabel(blocker)}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>

      {/* CTA fixo (organizador dono) */}
      {isOrganizer && (
        <SafeAreaView edges={['bottom']} style={styles.ctaWrap}>
          <TouchableOpacity
            style={[styles.cta, !canConfirm && styles.ctaDisabled]}
            onPress={handleComplete}
            disabled={!canConfirm}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canConfirm, busy: submitting }}
            accessibilityLabel="Concluir fase e gerar mata-mata"
            activeOpacity={0.85}
          >
            {submitting ? (
              <ActivityIndicator color={colors.bg100} />
            ) : (
              <>
                <Ionicons name="git-network" size={18} color={colors.bg100} />
                <Text style={styles.ctaText}>Concluir fase e gerar mata-mata</Text>
              </>
            )}
          </TouchableOpacity>
          {!review.allowed && (
            <Text style={styles.ctaHint}>
              Resolva as pendências acima para liberar a conclusão.
            </Text>
          )}
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg100 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Barlow-Bold', fontSize: 19, color: colors.textPrimary },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  skeletonWrap: { padding: 16, gap: 16 },
  summaryCard: {
    backgroundColor: colors.bg200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
  },
  summaryTitle: { fontFamily: 'Barlow-Bold', fontSize: 16, color: colors.textPrimary },
  summarySub: { fontFamily: 'Barlow-Medium', fontSize: 13, color: colors.textMuted },
  groupCard: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  groupTitle: { fontFamily: 'Barlow-Bold', fontSize: 15, color: colors.textPrimary },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.bg300,
  },
  teamRowQualified: {
    backgroundColor: colors.accentGlow,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  origin: { fontFamily: 'Barlow-SemiBold', fontSize: 12, color: colors.textMuted, minWidth: 66 },
  originQualified: { color: colors.accent },
  teamName: { flex: 1, fontFamily: 'Barlow-SemiBold', fontSize: 14, color: colors.textPrimary },
  tiebreak: { fontFamily: 'Barlow-Medium', fontSize: 10, color: colors.accent },
  points: { fontFamily: 'Barlow-Black', fontSize: 13, color: colors.textPrimary },
  eliminatedLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  crossingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.bg300,
  },
  crossingTeam: { flex: 1, fontFamily: 'Barlow-SemiBold', fontSize: 13, color: colors.textPrimary },
  crossingTeamRight: { textAlign: 'right' },
  crossingVs: { fontFamily: 'Barlow-Black', fontSize: 13, color: colors.textMuted },
  byeText: { fontFamily: 'Barlow-SemiBold', fontSize: 12, color: colors.success },
  byeHint: { fontFamily: 'Barlow-Regular', fontSize: 12, color: colors.textMuted, marginTop: 4 },
  warningCard: {
    backgroundColor: `${colors.warning}14`,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  warningRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  warningText: { flex: 1, fontFamily: 'Barlow-Medium', fontSize: 12, color: colors.textSecondary },
  blockerCard: {
    backgroundColor: `${colors.danger}14`,
    borderRadius: 12,
    padding: 12,
    gap: 6,
  },
  blockerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockerHeaderText: { fontFamily: 'Barlow-Bold', fontSize: 13, color: colors.danger },
  blockerItem: { fontFamily: 'Barlow-Regular', fontSize: 12, color: colors.textSecondary },
  blockerText: { flex: 1, fontFamily: 'Barlow-Medium', fontSize: 13, color: colors.textSecondary },
  ctaWrap: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.bg200,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.accent,
  },
  ctaDisabled: { backgroundColor: colors.bg300 },
  ctaText: { fontFamily: 'Barlow-Bold', fontSize: 15, color: colors.bg100 },
  ctaHint: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  bracketLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    margin: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg200,
  },
  bracketLinkText: { fontFamily: 'Barlow-SemiBold', fontSize: 14, color: colors.accent },
});
