import React, { useMemo, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart } from 'react-native-chart-kit';
import Toast from 'react-native-toast-message';
import { updateProfile } from 'firebase/auth';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';
import { AppTextField } from '../../components/AppTextField';
import { PlayerCard, PlayerCardErrorBoundary } from '../../components/PlayerCard';
import { SectionHeader } from '../../components/SectionHeader';
import { TeamColorDot } from '../../components/TeamColorDot';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useAthleteProfile } from '../../hooks/useAthleteProfile';
import { useCareerStats } from '../../hooks/useCareerStats';
import { useAuthStore } from '../../stores/authStore';
import { useTeamStore } from '../../stores/teamStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { auth } from '../../services/firebase';
import { updateDocument } from '../../services/firestore';
import { processWaitlistOnVacancy } from '../../services/inviteService';
import { uploadUserPhoto } from '../../services/imageUpload';
import { colors, gradients, shadows } from '../../theme/colors';
import { POSITION_LABELS, POSITION_OPTIONS } from '../../utils/constants';
import { getCardGradient } from '../../utils/playerOverall';
import { PlayerPosition } from '../../types';

type Props = NativeStackScreenProps<HomeStackParamList, 'AthleteProfile'>;

const chartWidth = Dimensions.get('window').width - 56;

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function formatHistoryDate(value: string) {
  try {
    return new Date(value).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
}

function truncateLabel(value: string) {
  return value.length > 6 ? `${value.slice(0, 6)}` : value;
}

function QuickStatCard({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <View style={styles.quickStatCard}>
      <Text style={styles.quickStatIcon}>{icon}</Text>
      <Text style={styles.quickStatValue}>{value}</Text>
      <Text style={styles.quickStatLabel}>{label}</Text>
    </View>
  );
}

function AchievementBadge({
  icon,
  backgroundColor,
  locked,
}: {
  icon: string;
  backgroundColor: string;
  locked?: boolean;
}) {
  return (
    <View style={[styles.achievementCircle, { backgroundColor }]}>
      <Text style={[styles.achievementEmoji, locked && styles.achievementEmojiLocked]}>{icon}</Text>
    </View>
  );
}

function CareerStatCard({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: string;
  label: string;
  value: number;
  valueColor: string;
}) {
  return (
    <View style={styles.careerStatCard}>
      <Text style={styles.careerStatIcon}>{icon}</Text>
      <Text style={[styles.careerStatValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.careerStatLabel}>{label}</Text>
    </View>
  );
}

export function AthleteProfileScreen({ route, navigation }: Props) {
  const authUser = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const signOut = useAuthStore((s) => s.signOut);
  const updatePlayer = useTeamStore((s) => s.updatePlayer);
  const { userId: routeUserId, championshipId } = route.params ?? {};
  const resolvedUserId = routeUserId ?? authUser?.id;
  const isOwnProfile = !!authUser?.id && authUser.id === resolvedUserId;

  const {
    user,
    player,
    team,
    activeChampionshipId,
    activeChampionshipName,
    goals,
    yellowCards,
    redCards,
    matchesPlayed,
    overall,
    history,
    achievements,
    achievementsUnlocked,
    totalAchievements,
    championByChampionshipId,
    loading,
  } = useAthleteProfile(resolvedUserId, championshipId);

  const { careerStats } = useCareerStats(resolvedUserId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [position, setPosition] = useState<PlayerPosition>('meia');
  const [shirtNumber, setShirtNumber] = useState('');
  const [localPhotoUrl, setLocalPhotoUrl] = useState<string | undefined>();

  const profileName = user?.name ?? player?.name ?? 'Atleta';
  const profilePhoto = localPhotoUrl ?? player?.photoUrl ?? authUser?.photoUrl;
  const activePosition = player?.position ?? position;
  const overallGradient = getCardGradient(overall) as [string, string, string];

  const visibleAchievements = useMemo(() => {
    const unlocked = achievements.slice(0, 6).map((item) => ({
      id: item.id,
      icon: item.icon,
      unlocked: true,
      color: `${item.rarityColor}22`,
    }));

    const lockedCount = Math.max(0, 6 - unlocked.length);
    const locked = Array.from({ length: lockedCount }, (_, index) => ({
      id: `locked-${index}`,
      icon: '🔒',
      unlocked: false,
      color: colors.bg300,
    }));

    return [...unlocked, ...locked];
  }, [achievements]);

  const evolutionEntries = useMemo(() => history.slice(0, 5).reverse(), [history]);

  const wasBestSeasonChampion = useMemo(
    () =>
      careerStats?.bestSeason
        ? history.some((h) => h.season === careerStats.bestSeason && h.isChampion)
        : false,
    [history, careerStats],
  );

  const openEditor = () => {
    setName(user?.name ?? player?.name ?? '');
    setPosition((player?.position ?? 'meia') as PlayerPosition);
    setShirtNumber(player?.number?.toString() ?? '');
    setLocalPhotoUrl(player?.photoUrl ?? authUser?.photoUrl);
    setSheetOpen(true);
  };

  const handlePickPhoto = async () => {
    if (!resolvedUserId) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Precisamos acessar sua galeria para atualizar a foto.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.[0]?.uri) return;

    setUploading(true);
    try {
      const uploadedUrl = await uploadUserPhoto(result.assets[0].uri, resolvedUserId);
      setLocalPhotoUrl(uploadedUrl);

      await updateDocument('users', resolvedUserId, { photoUrl: uploadedUrl });

      if (player) {
        await updateDocument('players', player.id, { photoUrl: uploadedUrl });
        updatePlayer(player.id, { photoUrl: uploadedUrl });
      }

      if (isOwnProfile && authUser) {
        setUser({ ...authUser, photoUrl: uploadedUrl });
      }

      Toast.show({
        type: 'success',
        text1: 'Foto atualizada',
        text2: 'Seu avatar foi salvo com sucesso.',
        visibilityTime: 2200,
      });
    } catch (error) {
      console.warn('[AthleteProfile] Avatar upload failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Erro ao atualizar foto',
        text2: 'Tente novamente em instantes.',
        visibilityTime: 2600,
      });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!resolvedUserId) return;

    const trimmedName = name.trim();
    const parsedNumber = Number(shirtNumber);

    if (!trimmedName) {
      Toast.show({ type: 'error', text1: 'Informe o nome do atleta', visibilityTime: 2200 });
      return;
    }

    if (shirtNumber && (Number.isNaN(parsedNumber) || parsedNumber < 1 || parsedNumber > 99)) {
      Toast.show({
        type: 'error',
        text1: 'Número inválido',
        text2: 'Use um número entre 1 e 99.',
        visibilityTime: 2400,
      });
      return;
    }

    setSaving(true);
    try {
      await updateDocument('users', resolvedUserId, {
        name: trimmedName,
        photoUrl: localPhotoUrl ?? null,
      });

      if (auth.currentUser && isOwnProfile) {
        await updateProfile(auth.currentUser, { displayName: trimmedName });
      }

      if (player) {
        const playerUpdates = {
          name: trimmedName,
          position,
          number: shirtNumber ? parsedNumber : player.number,
          ...(localPhotoUrl ? { photoUrl: localPhotoUrl } : {}),
        };
        await updateDocument('players', player.id, playerUpdates);
        updatePlayer(player.id, playerUpdates);
      }

      if (isOwnProfile && authUser) {
        setUser({
          ...authUser,
          name: trimmedName,
          photoUrl: localPhotoUrl ?? authUser.photoUrl,
        });
      }

      Toast.show({
        type: 'success',
        text1: 'Perfil salvo',
        text2: 'As informações do atleta foram atualizadas.',
        visibilityTime: 2200,
      });
      setSheetOpen(false);
    } catch (error) {
      console.warn('[AthleteProfile] Save failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Não foi possível salvar',
        text2: 'Confira sua conexão e tente novamente.',
        visibilityTime: 2600,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sair da conta', 'Deseja realmente encerrar sua sessão?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          signOut().catch(() => {
            Toast.show({
              type: 'error',
              text1: 'Não foi possível sair agora',
              visibilityTime: 2200,
            });
          });
        },
      },
    ]);
  };

  const championships = useChampionshipStore((s) => s.championships);
  const removePlayer = useTeamStore((s) => s.removePlayer);
  const currentChampionship = championships.find((c) => c.id === activeChampionshipId);
  const isChampionshipInProgress = currentChampionship?.status === 'em_andamento';
  const canLeaveTeam = isOwnProfile && team && player && (player.status === 'ativo' || !player.status);

  const handleLeaveTeam = () => {
    if (!team || !player || !authUser) return;

    const confirmLeave = async () => {
      try {
        // Update player status
        await updateDocument('players', player.id, {
          status: 'sem_time',
          leftAt: new Date().toISOString(),
          teamId: null,
        });

        // Update user
        await updateDocument('users', authUser.id, { teamId: null });

        // Notificar fila de espera sobre a vaga aberta
        processWaitlistOnVacancy(team.id).catch(() => {});

        // Update local state
        removePlayer(player.id);
        setUser({ ...authUser, teamId: undefined });

        Toast.show({
          type: 'success',
          text1: 'Você saiu do time',
          text2: 'Agora você pode entrar em outro time.',
          visibilityTime: 2500,
        });

        navigation.navigate('JoinTeam', { championshipId: activeChampionshipId ?? '' });
      } catch (error) {
        console.warn('[AthleteProfile] Leave team failed:', error);
        Toast.show({
          type: 'error',
          text1: 'Não foi possível sair do time',
          text2: 'Tente novamente em instantes.',
          visibilityTime: 2600,
        });
      }
    };

    Alert.alert(
      'Sair do time',
      `Tem certeza que quer sair do time ${team.name}? Você perderá suas estatísticas do campeonato atual.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair do time',
          style: 'destructive',
          onPress: () => {
            if (isChampionshipInProgress) {
              Alert.alert(
                'Campeonato em andamento',
                'O campeonato está em andamento. Suas estatísticas serão mantidas mas você não poderá mais jogar.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Confirmar saída', style: 'destructive', onPress: confirmLeave },
                ]
              );
            } else {
              confirmLeave();
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : undefined)}
          style={styles.headerIcon}
          disabled={!navigation.canGoBack()}
        >
          {navigation.canGoBack() ? (
            <Ionicons name="chevron-back" size={24} color={colors.accent} />
          ) : (
            <View style={styles.headerIconSpacer} />
          )}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isOwnProfile ? 'Perfil' : 'Atleta'}</Text>
        {isOwnProfile ? (
          <TouchableOpacity onPress={openEditor} style={styles.headerIcon}>
            <Ionicons name="create-outline" size={22} color={colors.accent} />
          </TouchableOpacity>
        ) : (
          <View style={styles.headerIconSpacer} />
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[colors.bg300, colors.bg100]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroCopy}>
            <View style={styles.avatarWrap}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInitials}>{getInitials(profileName)}</Text>
                </View>
              )}

              {isOwnProfile && (
                <TouchableOpacity
                  onPress={handlePickPhoto}
                  style={styles.cameraButton}
                  activeOpacity={0.82}
                  disabled={uploading}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.textOnAccent} />
                  ) : (
                    <Ionicons name="camera" size={14} color={colors.textOnAccent} />
                  )}
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.heroName}>{profileName}</Text>

            <View style={styles.metaRow}>
              <View style={styles.positionBadge}>
                <Text style={styles.positionBadgeText}>
                  {POSITION_LABELS[activePosition] ?? activePosition ?? 'Sem posição'}
                </Text>
              </View>
              {team && <TeamColorDot color={team.primaryColor} size={10} />}
              <Text style={styles.teamName}>{team?.name ?? 'Sem time'}</Text>
            </View>

            <View style={styles.metaRow}>
              <Ionicons name="trophy-outline" size={14} color={colors.accent} />
              <Text style={styles.championshipCaption} numberOfLines={1}>
                {activeChampionshipName || 'Sem campeonato ativo'}
              </Text>
            </View>
          </View>

          <LinearGradient colors={overallGradient} style={styles.overallBadge}>
            <Text style={styles.overallNumber}>{overall}</Text>
          </LinearGradient>
        </LinearGradient>

        <View style={styles.quickStatsRow}>
          <QuickStatCard icon="⚽" label="Gols" value={goals} />
          <QuickStatCard icon="🟨" label="Amarelos" value={yellowCards} />
          <QuickStatCard icon="🟥" label="Vermelhos" value={redCards} />
          <QuickStatCard icon="⚡" label="Partidas" value={matchesPlayed} />
        </View>

        <View style={styles.sectionWrap}>
          <SectionHeader title="MEU CARD FIFA" />
          <AppCard style={styles.fifaCard}>
            <View style={styles.fifaPreview}>
              <View style={styles.previewScale}>
                <PlayerCardErrorBoundary>
                  <PlayerCard
                    player={player ?? { name: profileName, position: activePosition, photoUrl: profilePhoto }}
                    team={team ?? { primaryColor: colors.accent }}
                    position={activePosition}
                    shirtNumber={player?.number ?? 0}
                    photoUrl={profilePhoto ?? null}
                    teamColor={team?.primaryColor ?? colors.accent}
                    goals={goals}
                    yellowCards={yellowCards}
                    redCards={redCards}
                    overall={overall || 50}
                    championshipName={activeChampionshipName || 'Sem campeonato ativo'}
                  />
                </PlayerCardErrorBoundary>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => {
                if (player && activeChampionshipId) {
                  navigation.navigate('PlayerCard', {
                    playerId: player.id,
                    championshipId: activeChampionshipId,
                  });
                }
              }}
              disabled={!player || !activeChampionshipId}
            >
              <Text style={[styles.linkAction, (!player || !activeChampionshipId) && styles.linkDisabled]}>
                Ver card completo →
              </Text>
            </TouchableOpacity>
          </AppCard>
        </View>

        <View style={styles.sectionWrap}>
          <SectionHeader
            title="CONQUISTAS"
            subtitle={`${achievementsUnlocked} / ${totalAchievements}`}
            action={
              player && activeChampionshipId
                ? {
                    text: 'Ver todas →',
                    onPress: () =>
                      navigation.navigate('PlayerAchievements', {
                        playerId: player.id,
                        championshipId: activeChampionshipId,
                      }),
                  }
                : undefined
            }
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.achievementsRow}
          >
            {visibleAchievements.map((item) => (
              <View key={item.id} style={styles.achievementItem}>
                <AchievementBadge
                  icon={item.icon}
                  backgroundColor={item.color}
                  locked={!item.unlocked}
                />
              </View>
            ))}
          </ScrollView>
        </View>

        {/* ── CARREIRA ── */}
        <View style={styles.sectionWrap}>
          <SectionHeader title="CARREIRA" />
          {careerStats ? (
            <LinearGradient
              colors={[colors.bg300, colors.bg100]}
              style={styles.careerHero}
            >
              <Text style={styles.careerHeroTitle}>CARREIRA FJU</Text>

              <View style={styles.careerGrid}>
                <CareerStatCard icon="🏆" label="TÍTULOS"     value={careerStats.totalTitles}        valueColor={colors.accentLight} />
                <CareerStatCard icon="⚽" label="GOLS"        value={careerStats.totalGoals}         valueColor={colors.accent} />
                <CareerStatCard icon="🅰️" label="ASSIST."     value={careerStats.totalAssists ?? 0}  valueColor={colors.neon} />
                <CareerStatCard icon="🏟️" label="JOGOS"       value={careerStats.totalMatches}       valueColor={colors.textPrimary} />
                <CareerStatCard icon="🌟" label="MVPs"        value={careerStats.totalMvps}          valueColor={colors.accentLight} />
                <CareerStatCard icon="📅" label="TEMPORADAS"  value={careerStats.totalChampionships} valueColor={colors.textSecondary} />
              </View>

              {careerStats.bestSeason ? (
                <AppCard variant="accent" style={styles.bestSeasonCard}>
                  <View style={styles.bestSeasonTopRow}>
                    <Text style={styles.bestSeasonLabel}>🏅 MELHOR TEMPORADA</Text>
                    <View style={styles.bestSeasonRight}>
                      <Text style={styles.bestSeasonYear}>{careerStats.bestSeason}</Text>
                      {wasBestSeasonChampion && (
                        <View style={styles.championBadgeSmall}>
                          <Text style={styles.championBadgeSmallText}>🏆 CAMPEÃO</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <Text style={styles.bestSeasonStats}>
                    ⚽ {careerStats.bestSeasonGoals} gols · 🏟️ {
                      history.find((h) => h.season === careerStats.bestSeason)?.matchesPlayed ?? '—'
                    } partidas · Overall {careerStats.bestOverall}
                  </Text>
                </AppCard>
              ) : null}
            </LinearGradient>
          ) : (
            <AppCard style={styles.emptyCard}>
              <Text style={styles.emptyText}>Participe de campeonatos para ver sua carreira.</Text>
            </AppCard>
          )}

          {resolvedUserId ? (
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('CareerCard', { userId: resolvedUserId })
              }
              style={styles.careerCardBtn}
              activeOpacity={0.82}
            >
              <Text style={styles.careerCardBtnText}>🃏 Ver card de carreira</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.accent} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── HISTÓRICO POR TEMPORADA ── */}
        <View style={styles.sectionWrap}>
          <SectionHeader title="HISTÓRICO POR TEMPORADA" />
          {history.length > 0 ? (
            <FlatList
              data={history}
              keyExtractor={(item) => item.id}
              renderItem={({ item, index }) => {
                const isChampion = item.isChampion ?? championByChampionshipId[item.championshipId] ?? false;
                return (
                  <Animated.View entering={FadeInDown.delay(index * 70).duration(350)}>
                    <View style={[styles.historyItem, isChampion && styles.historyItemChampion]}>
                      <View style={styles.historyTopRow}>
                        <View style={styles.historyTitleWrap}>
                          {item.season ? (
                            <View style={styles.seasonBadge}>
                              <Text style={styles.seasonBadgeText}>{item.season}</Text>
                            </View>
                          ) : null}
                          <Text style={styles.historyTitle} numberOfLines={1}>
                            {item.championshipName}
                          </Text>
                        </View>
                        <LinearGradient
                          colors={getCardGradient(item.overall) as [string, string, string]}
                          style={styles.historyOverallBadge}
                        >
                          <Text style={styles.historyOverallValue}>{item.overall}</Text>
                        </LinearGradient>
                      </View>

                      <View style={styles.historyStatsRow}>
                        <Text style={styles.historyStatChip}>⚽ {item.goals}</Text>
                        <Text style={styles.historyStatChip}>🅰️ {item.assists ?? 0}</Text>
                        <Text style={styles.historyStatChip}>🏟️ {item.matchesPlayed}</Text>
                        {(item.roundMvpCount ?? 0) > 0 && (
                          <Text style={styles.historyStatChip}>🌟 {item.roundMvpCount}</Text>
                        )}
                      </View>

                      {isChampion && (
                        <View style={styles.championBadge}>
                          <Text style={styles.championBadgeText}>🏆 CAMPEÃO</Text>
                        </View>
                      )}
                    </View>
                  </Animated.View>
                );
              }}
              scrollEnabled={false}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            />
          ) : (
            <AppCard style={styles.emptyCard}>
              <Text style={styles.emptyText}>Nenhum campeonato finalizado no histórico ainda.</Text>
            </AppCard>
          )}
        </View>

        <View style={styles.sectionWrap}>
          <SectionHeader title="EVOLUÇÃO DO OVERALL" />
          {evolutionEntries.length >= 2 ? (
            <AppCard style={styles.chartCard}>
              <LineChart
                data={{
                  labels: evolutionEntries.map((entry) => truncateLabel(entry.championshipName)),
                  datasets: [{ data: evolutionEntries.map((entry) => entry.overall) }],
                }}
                width={chartWidth}
                height={220}
                bezier
                withInnerLines={false}
                withOuterLines={false}
                chartConfig={{
                  backgroundColor: colors.bg200,
                  backgroundGradientFrom: colors.bg200,
                  backgroundGradientTo: colors.bg200,
                  decimalPlaces: 0,
                  color: () => colors.accent,
                  labelColor: () => colors.textSecondary,
                  propsForDots: {
                    r: '4',
                    strokeWidth: '2',
                    stroke: colors.accent,
                    fill: colors.bg100,
                  },
                }}
                style={styles.chartStyle}
              />
            </AppCard>
          ) : (
            <AppCard style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                Participe de mais campeonatos para ver sua evolução
              </Text>
            </AppCard>
          )}
        </View>

        {isOwnProfile && canLeaveTeam && (
          <TouchableOpacity onPress={handleLeaveTeam} style={styles.leaveTeamButton}>
            <Ionicons name="exit-outline" size={18} color={colors.warning} />
            <Text style={styles.leaveTeamText}>Sair do time</Text>
          </TouchableOpacity>
        )}

        {isOwnProfile && (
          <TouchableOpacity onPress={handleSignOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>Sair da conta</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <BottomSheet
        index={sheetOpen ? 0 : -1}
        snapPoints={['66%']}
        enablePanDownToClose
        onClose={() => setSheetOpen(false)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.45} />
        )}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}
      >
        <BottomSheetScrollView contentContainerStyle={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Editar perfil</Text>

          <TouchableOpacity onPress={handlePickPhoto} style={styles.sheetAvatarTouch} activeOpacity={0.82}>
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.sheetAvatarImage} />
            ) : (
              <View style={styles.sheetAvatarFallback}>
                <Text style={styles.sheetAvatarInitials}>{getInitials(name || profileName)}</Text>
              </View>
            )}
            <View style={styles.sheetAvatarCamera}>
              {uploading ? (
                <ActivityIndicator size="small" color={colors.textOnAccent} />
              ) : (
                <Ionicons name="camera" size={16} color={colors.textOnAccent} />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Nome</Text>
            <AppTextField
              value={name}
              onChangeText={setName}
              placeholder="Nome do atleta"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Posição</Text>
            <BottomSheetView style={styles.positionGrid}>
              {POSITION_OPTIONS.map((option) => {
                const selected = position === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => setPosition(option.value as PlayerPosition)}
                    style={[styles.positionOption, selected && styles.positionOptionSelected]}
                  >
                    <Text style={[styles.positionOptionText, selected && styles.positionOptionTextSelected]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </BottomSheetView>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Número da camisa</Text>
            <TextInput
              value={shirtNumber}
              onChangeText={(value) => setShirtNumber(value.replace(/\D/g, '').slice(0, 2))}
              placeholder="Ex: 10"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              style={styles.numberInput}
            />
          </View>

          <AppButton
            title={saving ? 'Salvando...' : 'Salvar'}
            onPress={handleSave}
            fullWidth
            disabled={saving}
          />
        </BottomSheetScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  headerIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconSpacer: {
    width: 24,
    height: 24,
  },
  content: {
    paddingBottom: 36,
  },
  hero: {
    height: 260,
    paddingHorizontal: 20,
    paddingTop: 24,
    justifyContent: 'center',
  },
  heroCopy: {
    gap: 10,
  },
  avatarWrap: {
    width: 100,
    height: 100,
    position: 'relative',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.accent,
    ...shadows.shadowGlow,
  },
  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.bg300,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.accent,
    ...shadows.shadowGlow,
  },
  avatarInitials: {
    fontFamily: 'Barlow-Black',
    fontSize: 36,
    color: colors.accent,
  },
  cameraButton: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.bg100,
  },
  heroName: {
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: '#FFFFFF',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  positionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  positionBadgeText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  teamName: {
    fontFamily: 'Barlow-Medium',
    fontSize: 14,
    color: colors.textPrimary,
  },
  championshipCaption: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.accent,
  },
  overallBadge: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overallNumber: {
    fontFamily: 'Barlow-Black',
    fontSize: 24,
    color: '#FFFFFF',
  },
  quickStatsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 14,
  },
  quickStatCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickStatIcon: {
    fontSize: 16,
  },
  quickStatValue: {
    marginTop: 6,
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.accent,
  },
  quickStatLabel: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 10,
    color: colors.textMuted,
  },
  sectionWrap: {
    paddingHorizontal: 20,
    marginTop: 22,
  },
  fifaCard: {
    marginTop: 12,
    padding: 18,
    alignItems: 'center',
  },
  fifaPreview: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  previewScale: {
    transform: [{ scale: 0.6 }],
  },
  previewCardShell: {
    width: 220,
    height: 320,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewOverall: {
    position: 'absolute',
    top: 20,
    left: 20,
    fontFamily: 'Barlow-Black',
    fontSize: 42,
    color: '#FFFFFF',
  },
  previewPosition: {
    position: 'absolute',
    top: 64,
    left: 20,
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: '#FFFFFF',
  },
  previewAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  previewAvatarText: {
    fontFamily: 'Barlow-Black',
    fontSize: 38,
    color: '#FFFFFF',
  },
  previewName: {
    marginTop: 12,
    paddingHorizontal: 16,
    fontFamily: 'Barlow-Bold',
    fontSize: 18,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  previewTeamDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginTop: 10,
  },
  previewEmpty: {
    width: 220,
    height: 150,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
  },
  previewEmptyText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 16,
    color: colors.textSecondary,
  },
  linkAction: {
    marginTop: 8,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.accent,
  },
  linkDisabled: {
    color: colors.textMuted,
  },
  achievementsRow: {
    gap: 12,
    paddingTop: 12,
    paddingRight: 20,
  },
  achievementItem: {
    alignItems: 'center',
  },
  achievementCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  achievementEmoji: {
    fontSize: 24,
  },
  achievementEmojiLocked: {
    opacity: 0.3,
  },
  // ── Career section ──
  careerHero: {
    marginTop: 12,
    borderRadius: 16,
    padding: 16,
    borderTopWidth: 3,
    borderTopColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  careerHeroTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  careerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  careerStatCard: {
    width: '30.5%',
    flexGrow: 1,
    backgroundColor: colors.bg200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 4,
  },
  careerStatIcon: {
    fontSize: 18,
  },
  careerStatValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 32,
    lineHeight: 38,
  },
  careerStatLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 9,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  bestSeasonCard: {
    padding: 16,
    gap: 8,
  },
  bestSeasonTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bestSeasonLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  bestSeasonRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bestSeasonYear: {
    fontFamily: 'Barlow-Black',
    fontSize: 13,
    color: colors.accent,
  },
  bestSeasonStats: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  championBadgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.accentGlow,
  },
  championBadgeSmallText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
    color: colors.accent,
  },

  careerCardBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
  },
  careerCardBtnText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.accent,
  },

  // ── History items ──
  historyItem: {
    backgroundColor: colors.bg200,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
  },
  historyItemChampion: {
    backgroundColor: colors.accentGlow,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  historyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  historyTitleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seasonBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  seasonBadgeText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 11,
    color: colors.accent,
  },
  historyTitle: {
    flex: 1,
    fontFamily: 'Barlow-Bold',
    fontSize: 14,
    color: colors.textPrimary,
  },
  historyOverallBadge: {
    minWidth: 40,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  historyOverallValue: {
    fontFamily: 'Barlow-Black',
    fontSize: 14,
    color: '#FFFFFF',
  },
  historyStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyStatChip: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  championBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.accentGlow,
  },
  championBadgeText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    color: colors.accent,
  },
  chartCard: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
    overflow: 'hidden',
  },
  chartStyle: {
    borderRadius: 16,
  },
  emptyCard: {
    marginTop: 12,
    padding: 18,
  },
  emptyText: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  leaveTeamButton: {
    marginHorizontal: 20,
    marginTop: 24,
    minHeight: 48,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,193,7,0.3)',
    backgroundColor: 'rgba(255,193,7,0.1)',
  },
  leaveTeamText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.warning,
  },
  signOutButton: {
    marginHorizontal: 20,
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,59,71,0.2)',
    backgroundColor: 'rgba(255,59,71,0.08)',
  },
  signOutText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.danger,
  },
  sheetBackground: {
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: {
    backgroundColor: colors.borderStrong,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    gap: 18,
  },
  sheetTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  sheetAvatarTouch: {
    alignSelf: 'center',
    position: 'relative',
  },
  sheetAvatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  sheetAvatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  sheetAvatarInitials: {
    fontFamily: 'Barlow-Black',
    fontSize: 36,
    color: colors.accent,
  },
  sheetAvatarCamera: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: colors.bg200,
  },
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textSecondary,
  },
  positionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  positionOption: {
    minWidth: '31%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg300,
  },
  positionOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accentGlow,
  },
  positionOptionText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  positionOptionTextSelected: {
    color: colors.accent,
    fontFamily: 'Barlow-SemiBold',
  },
  numberInput: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg300,
    fontFamily: 'Barlow-Medium',
    fontSize: 16,
    color: colors.textPrimary,
  },
});
