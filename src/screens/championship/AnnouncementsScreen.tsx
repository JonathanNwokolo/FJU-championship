import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import Toast from 'react-native-toast-message';

import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import {
  listenToAnnouncements,
  markAnnouncementAsRead,
  createAnnouncement,
  AUDIENCE_LABELS,
} from '../../services/announcementsService';
import { isActiveRosterPlayer } from '../../utils/teamRules';
import { Announcement, AnnouncementAudience, Team } from '../../types';
import { AppButton } from '../../components/AppButton';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { colors, gradients } from '../../theme/colors';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type RouteT = RouteProp<HomeStackParamList, 'Announcements'>;

const SNAP_POINTS = ['80%'];

const AUDIENCE_OPTIONS: { value: AnnouncementAudience; label: string; icon: string }[] = [
  { value: 'todos', label: 'Todos', icon: '🌐' },
  { value: 'capitaes', label: 'Só capitães', icon: '🛡️' },
  { value: 'atletas', label: 'Só atletas', icon: '⚽' },
  { value: 'time_especifico', label: 'Time específico', icon: '👥' },
];

function formatRelative(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'agora';
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  } catch {
    return '';
  }
}

function AnnouncementRow({
  item,
  userId,
  onPress,
}: {
  item: Announcement;
  userId: string;
  onPress: (a: Announcement) => void;
}) {
  const isUnread = !item.readBy.includes(userId);
  const isUrgent = item.priority === 'urgente';

  return (
    <Pressable
      style={[styles.row, isUnread && styles.rowUnread, isUrgent && styles.rowUrgent]}
      onPress={() => onPress(item)}
    >
      {isUnread && <View style={[styles.unreadBar, isUrgent && styles.unreadBarUrgent]} />}
      <View style={styles.rowInner}>
        <View style={styles.rowTop}>
          <View style={styles.rowMeta}>
            {isUrgent && (
              <View style={styles.urgentBadge}>
                <Text style={styles.urgentBadgeText}>URGENTE</Text>
              </View>
            )}
            <View style={styles.audienceBadge}>
              <Text style={styles.audienceBadgeText}>
                {AUDIENCE_LABELS[item.targetAudience]}
              </Text>
            </View>
          </View>
          <Text style={styles.rowTime}>{formatRelative(item.createdAt)}</Text>
        </View>
        <Text style={[styles.rowTitle, isUnread && styles.rowTitleUnread]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.rowBody} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.rowAuthor}>{item.authorName}</Text>
      </View>
    </Pressable>
  );
}

function AnnouncementsSkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      {Array.from({ length: 4 }).map((_, i) => (
        <View key={i} style={styles.skeletonCard}>
          <SkeletonLoader width={60} height={18} borderRadius={4} variant="shimmer" />
          <View style={styles.skeletonGap} />
          <SkeletonLoader width="70%" height={16} variant="shimmer" />
          <View style={styles.skeletonGap} />
          <SkeletonLoader width="90%" height={12} variant="shimmer" />
          <View style={styles.skeletonGapSm} />
          <SkeletonLoader width="60%" height={12} variant="shimmer" />
          <View style={styles.skeletonGap} />
          <SkeletonLoader width="30%" height={10} variant="shimmer" />
        </View>
      ))}
    </View>
  );
}

export function AnnouncementsScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteT>();
  const { championshipId } = route.params;

  const user = useAuthStore((s) => s.user);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const championships = useChampionshipStore((s) => s.championships);

  const championship = championships.find((c) => c.id === championshipId);
  // Só player ATIVO define "meu time" — doc 'sem_time' guarda o teamId antigo.
  const myPlayer = players.find(
    (p) =>
      p.userId === user?.id &&
      p.championshipId === championshipId &&
      isActiveRosterPlayer(p),
  );
  const myTeam = myPlayer ? teams.find((t) => t.id === myPlayer.teamId) : undefined;
  const captainTeam = teams.find((t) => t.captainId === user?.id && t.championshipId === championshipId);
  const effectiveTeam: Team | undefined = myTeam ?? captainTeam;
  const teamId = effectiveTeam?.id ?? null;

  const canCreate = user?.role === 'organizador' || user?.role === 'capitao';
  const isOrganizer = user?.role === 'organizador';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  // BottomSheet state
  const sheetRef = useRef<BottomSheet>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>(
    isOrganizer ? 'todos' : 'time_especifico',
  );
  const [selectedTeamId, setSelectedTeamId] = useState(teamId ?? '');
  const [urgent, setUrgent] = useState(false);
  const [saving, setSaving] = useState(false);

  const championshipTeams = useMemo(
    () => teams.filter((t) => t.championshipId === championshipId && t.status === 'aprovado'),
    [teams, championshipId],
  );

  useEffect(() => {
    if (!user?.id) return;
    const unsub = listenToAnnouncements(
      championshipId,
      user.id,
      teamId,
      user.role,
      (list) => {
        setAnnouncements(list);
        setLoading(false);
      },
    );
    return unsub;
  }, [championshipId, user?.id, user?.role, teamId]);

  const handlePress = useCallback(
    async (item: Announcement) => {
      if (!user?.id || item.readBy.includes(user.id)) return;
      await markAnnouncementAsRead(item.id, user.id);
    },
    [user?.id],
  );

  const openSheet = useCallback(() => {
    setTitle('');
    setBody('');
    setUrgent(false);
    setAudience(isOrganizer ? 'todos' : 'time_especifico');
    setSelectedTeamId(teamId ?? '');
    sheetRef.current?.expand();
  }, [isOrganizer, teamId]);

  const handleCreate = useCallback(async () => {
    if (!title.trim() || !body.trim()) {
      Toast.show({ type: 'error', text1: 'Preencha título e mensagem' });
      return;
    }
    if (audience === 'time_especifico' && !selectedTeamId) {
      Toast.show({ type: 'error', text1: 'Selecione o time de destino' });
      return;
    }
    if (!user?.id) return;

    setSaving(true);
    try {
      // Capitão real é quem está como captainId do time, mesmo que o role salvo
      // em /users ainda seja 'atleta' — o comunicado deve registrar 'capitao'.
      const isCaptain = effectiveTeam?.captainId === user.id;
      await createAnnouncement({
        championshipId,
        authorId: user.id,
        authorName: user.name ?? 'Usuário',
        authorRole: isCaptain ? 'capitao' : user.role,
        title: title.trim(),
        body: body.trim(),
        targetAudience: audience,
        targetTeamId: audience === 'time_especifico' ? selectedTeamId : undefined,
        priority: urgent ? 'urgente' : 'normal',
      });
      sheetRef.current?.close();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Toast.show({ type: 'success', text1: 'Aviso publicado!' });
    } catch {
      Toast.show({ type: 'error', text1: 'Erro ao publicar aviso' });
    } finally {
      setSaving(false);
    }
  }, [title, body, audience, selectedTeamId, urgent, user, championshipId, effectiveTeam]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.7} />
    ),
    [],
  );

  const unreadCount = useMemo(
    () => (user?.id ? announcements.filter((a) => !a.readBy.includes(user.id)).length : 0),
    [announcements, user?.id],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={colors.accent} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Avisos</Text>
          {unreadCount > 0 && (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        {canCreate && (
          <TouchableOpacity onPress={openSheet} style={styles.addBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="add-circle" size={28} color={colors.accent} />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <AnnouncementsSkeleton />
      ) : announcements.length === 0 ? (
        <EmptyState
          icon="📢"
          title="Nenhum aviso ainda"
          description={
            canCreate
              ? 'Crie o primeiro comunicado para manter todos informados.'
              : 'Quando houver comunicados do campeonato, eles aparecerão aqui.'
          }
        />
      ) : (
        <FlatList
          data={announcements}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 45).duration(260)}>
              <AnnouncementRow item={item} userId={user?.id ?? ''} onPress={handlePress} />
            </Animated.View>
          )}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Create BottomSheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBg}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          <Text style={styles.sheetTitle}>Novo Aviso</Text>

          <Text style={styles.fieldLabel}>Título</Text>
          <BottomSheetTextInput
            style={styles.input}
            placeholder="Ex: Jogo adiado..."
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />

          <Text style={styles.fieldLabel}>Mensagem</Text>
          <BottomSheetTextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Escreva o aviso completo..."
            placeholderTextColor={colors.textMuted}
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={4}
            maxLength={500}
          />

          {/* Audience — organizador vê todas as opções, capitão vê apenas seu time */}
          {isOrganizer && (
            <>
              <Text style={styles.fieldLabel}>Destinatários</Text>
              <View style={styles.audienceRow}>
                {AUDIENCE_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    active={audience === opt.value}
                    onPress={() => setAudience(opt.value)}
                    size="sm"
                  />
                ))}
              </View>

              {audience === 'time_especifico' && (
                <>
                  <Text style={styles.fieldLabel}>Selecionar time</Text>
                  <View style={styles.teamList}>
                    {championshipTeams.map((t) => (
                      <Chip
                        key={t.id}
                        label={t.name}
                        active={selectedTeamId === t.id}
                        onPress={() => setSelectedTeamId(t.id)}
                        size="sm"
                        style={styles.teamChip}
                      />
                    ))}
                  </View>
                </>
              )}
            </>
          )}

          {/* Urgent toggle */}
          <View style={styles.urgentRow}>
            <View style={styles.urgentInfo}>
              <Text style={styles.urgentLabel}>Aviso urgente</Text>
              <Text style={styles.urgentDesc}>Aparece em destaque para todos os destinatários</Text>
            </View>
            <Switch
              value={urgent}
              onValueChange={setUrgent}
              trackColor={{ true: colors.danger, false: colors.bg300 }}
              thumbColor={urgent ? '#fff' : colors.textMuted}
            />
          </View>

          <AppButton
            title={saving ? 'Publicando...' : 'Publicar aviso'}
            onPress={handleCreate}
            disabled={saving}
            loading={saving}
            fullWidth
            style={styles.publishBtn}
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg200,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  headerBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: '#fff',
  },
  addBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonWrap: {
    paddingTop: 8,
  },
  skeletonCard: {
    backgroundColor: colors.bg200,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  skeletonGap: {
    height: 8,
  },
  skeletonGapSm: {
    height: 6,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 40,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
    marginLeft: 16,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.bg200,
  },
  rowUnread: {
    backgroundColor: colors.accentGlow,
  },
  rowUrgent: {
    backgroundColor: 'rgba(255,59,71,0.08)',
  },
  unreadBar: {
    width: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  unreadBarUrgent: {
    backgroundColor: colors.danger,
  },
  rowInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  urgentBadge: {
    backgroundColor: colors.danger,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  urgentBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 9,
    color: '#fff',
    letterSpacing: 0.5,
  },
  audienceBadge: {
    backgroundColor: colors.bg300,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  audienceBadgeText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 10,
    color: colors.textSecondary,
  },
  rowTime: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
    marginLeft: 6,
  },
  rowTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 4,
    lineHeight: 20,
  },
  rowTitleUnread: {
    color: colors.textPrimary,
  },
  rowBody: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 8,
  },
  rowAuthor: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textMuted,
  },
  // ── BottomSheet ──────────────────────────────────────────────────────────────
  sheetBg: {
    backgroundColor: colors.bg200,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  sheetHandle: {
    backgroundColor: colors.borderStrong,
    width: 40,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 4,
  },
  sheetTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 16,
    marginTop: 4,
  },
  fieldLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.bg300,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputMulti: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  audienceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  audienceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  audienceChipActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  audienceChipIcon: {
    fontSize: 14,
  },
  audienceChipLabel: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  audienceChipLabelActive: {
    color: colors.accent,
  },
  teamList: {
    gap: 8,
  },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamChipActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  teamDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  teamChipLabel: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textSecondary,
  },
  teamChipLabelActive: {
    color: colors.accent,
  },
  urgentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 4,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  urgentInfo: {
    flex: 1,
    marginRight: 12,
  },
  urgentLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  urgentDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  publishBtn: {
    marginTop: 20,
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishBtnDisabled: {
    opacity: 0.6,
  },
  publishBtnText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textOnAccent,
  },
});
