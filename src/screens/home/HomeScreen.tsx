import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Animated, {
  SharedValue,
  SlideInRight,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { AppCard } from '../../components/AppCard';
import { Badge } from '../../components/Badge';
import { SectionHeader } from '../../components/SectionHeader';
import { TeamColorDot } from '../../components/TeamColorDot';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { ChampionshipHistoryCard } from '../../components/ChampionshipHistoryCard';
import { RoleContextSwitch } from '../../components/RoleContextSwitch';
import { SearchBar } from '../../components/SearchBar';
import { EmptyState } from '../../components/EmptyState';
import { useChampionshipHistory } from '../../hooks/useChampionshipHistory';
import { useNotificationBadge } from '../../hooks/useNotificationBadge';
import { useAnnouncementsBadge } from '../../hooks/useAnnouncementsBadge';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useMatchStore } from '../../stores/matchStore';
import { useTeamStore } from '../../stores/teamStore';
import { getCollection } from '../../services/index';
import { Championship, MatchModel, Team, UserRole, Player } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { colors, gradients, shadows } from '../../theme/colors';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];
type FeatherIconName = React.ComponentProps<typeof Feather>['name'];

const ROLE_LABELS: Record<UserRole, string> = {
  organizador: 'Organizador',
  capitao: 'Capitão',
  atleta: 'Atleta',
};

const ROLE_OPTIONS: { role: UserRole; icon: string; label: string; desc: string }[] = [
  { role: 'capitao', icon: '🛡️', label: 'Capitão', desc: 'Inscreve e gerencia o elenco do time' },
  { role: 'atleta', icon: '⚽', label: 'Atleta', desc: 'Acompanha jogos e estatísticas' },
];

function formatChampionshipFormat(format: Championship['format']) {
  const labels: Record<Championship['format'], string> = {
    pontos_corridos: 'Pontos corridos',
    mata_mata: 'Mata-mata',
    grupos_e_mata_mata: 'Grupos + mata-mata',
  };
  return labels[format];
}

function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function getStatusBadge(championship: Championship) {
  if (championship.status === 'em_andamento') {
    return <Badge label="EM ANDAMENTO" variant="approved" />;
  }
  if (championship.status === 'inscricoes_abertas') {
    return <Badge label="INSCRIÇÕES ABERTAS" variant="pending" />;
  }
  return <Badge label="FINALIZADO" variant="draw" />;
}

function getTeam(teams: Team[], teamId: string) {
  return teams.find((team) => team.id === teamId);
}

function formatScheduledAt(value?: string | null): string {
  if (!value) return 'Data a definir';
  try {
    const d = new Date(value);
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
    const day = d.getDate().toString().padStart(2, '0');
    const month = d.toLocaleDateString('pt-BR', { month: 'short' });
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    const cap = weekday.charAt(0).toUpperCase() + weekday.slice(1).replace('.', '');
    return `${cap}, ${day} ${month} · ${h}h${m}`;
  } catch {
    return value;
  }
}

function isToday(value?: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isTomorrow(value?: string | null): boolean {
  if (!value) return false;
  const d = new Date(value);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
}

function navigateToTab(navigation: NavProp, tabName: string) {
  const tabAliases: Record<string, string> = {
    'Início': 'Inicio',
    'InÃ­cio': 'Inicio',
    'Classificação': 'Classificacao',
    'ClassificaÃ§Ã£o': 'Classificacao',
  };
  navigation.getParent()?.navigate((tabAliases[tabName] ?? tabName) as never);
}

function LinearProgress({ value, style }: { value: number; style?: ViewStyle }) {
  const normalized = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.progressTrack, style]}>
      <View style={[styles.progressFill, { width: `${normalized * 100}%` }]} />
    </View>
  );
}

function StickyHeader({
  userName,
  userPhotoUrl,
  unreadCount,
  isOrganizer,
  onOpenRoleSwitcher,
  onAvatarPress,
  onBellPress,
  onSearchPress,
  shadowProgress,
}: {
  userName?: string;
  userPhotoUrl?: string;
  unreadCount: number;
  isOrganizer: boolean;
  onOpenRoleSwitcher: () => void;
  onAvatarPress: () => void;
  onBellPress: () => void;
  onSearchPress: () => void;
  shadowProgress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: shadowProgress.value > 12 ? 0.28 : 0,
    elevation: shadowProgress.value > 12 ? 8 : 0,
  }));

  return (
    <Animated.View style={[styles.stickyHeader, animatedStyle]}>
      <View style={styles.userCluster}>
        <Pressable onPress={onAvatarPress}>
          {userPhotoUrl ? (
            <Image source={{ uri: userPhotoUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{getInitials(userName)}</Text>
            </View>
          )}
        </Pressable>
        {isOrganizer ? (
          // Organizador não troca de perfil: badge fixo, sem abrir o RoleSwitcher.
          <View style={styles.organizerCluster}>
            <Text style={styles.hello} numberOfLines={1}>Olá, {userName}</Text>
            <View style={styles.organizerBadge}>
              <MaterialCommunityIcons name="shield-crown" size={13} color={colors.accent} />
              <Text style={styles.organizerBadgeText}>Organizador</Text>
            </View>
          </View>
        ) : (
          <Pressable onPress={onOpenRoleSwitcher}>
            <Text style={styles.hello} numberOfLines={1}>Olá, {userName}</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.headerActions}>
        <Pressable onPress={onSearchPress} style={styles.bellWrap}>
          <Ionicons name="search-outline" size={22} color={colors.textPrimary} />
        </Pressable>
        <Pressable onPress={onBellPress} style={styles.bellWrap}>
          <Ionicons name="notifications-outline" size={23} color={colors.textPrimary} />
          {unreadCount > 0 && <View style={styles.notificationBadge} />}
          {unreadCount > 0 && (
            <View style={styles.unreadBubble}>
              <Text style={styles.unreadBubbleText}>
                {unreadCount > 9 ? '9+' : String(unreadCount)}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

function HeroCard({
  championship,
  teamsCount,
}: {
  championship?: Championship;
  teamsCount: number;
}) {
  if (!championship) {
    return (
      <LinearGradient colors={gradients.card} style={styles.heroCard}>
        <View style={styles.heroAccentLine} />
        <Text style={styles.heroTitle}>Nenhum campeonato ativo</Text>
        <Text style={styles.heroSubtitle}>Crie ou entre em um campeonato para começar</Text>
      </LinearGradient>
    );
  }

  const progress =
    championship.totalRounds > 0 ? championship.currentRound / championship.totalRounds : 0;

  const seasonLabel = championship.season
    ? `Temporada ${championship.season}${championship.edition ? ` · Edição ${championship.edition}ª` : ''}`
    : null;

  return (
    <LinearGradient
      colors={[colors.bg300, colors.bg200]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.heroCard}
    >
      <View style={styles.heroAccentLine} />
      <Ionicons name="trophy" size={80} color={colors.accent} style={styles.heroTrophy} />
      <View style={styles.heroBadge}>{getStatusBadge(championship)}</View>
      <Text style={styles.heroTitle} numberOfLines={2}>{championship.name}</Text>
      <Text style={styles.heroSubtitle}>
        {seasonLabel ?? formatChampionshipFormat(championship.format)} · {teamsCount} times
      </Text>
      {championship.status === 'em_andamento' && (
        <View style={styles.heroProgressBlock}>
          <View style={styles.progressCopy}>
            <Text style={styles.roundText}>
              Rodada {championship.currentRound} de {championship.totalRounds}
            </Text>
            <Text style={styles.roundPercent}>{Math.round(progress * 100)}%</Text>
          </View>
          <LinearProgress value={progress} />
        </View>
      )}
    </LinearGradient>
  );
}

function QuickAccessCard({
  icon,
  title,
  onPress,
  iconFamily = 'ionicons',
}: {
  icon: IoniconName | FeatherIconName;
  title: string;
  onPress: () => void;
  iconFamily?: 'ionicons' | 'feather';
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.quickCardWrap, animatedStyle]}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 16, stiffness: 260 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 16, stiffness: 260 });
        }}
      >
        <AppCard style={styles.quickCard}>
          <View style={styles.quickIcon}>
            {iconFamily === 'feather' ? (
              <Feather name={icon as FeatherIconName} size={24} color={colors.accent} />
            ) : (
              <Ionicons name={icon as IoniconName} size={24} color={colors.accent} />
            )}
          </View>
          <Text style={styles.quickTitle}>{title}</Text>
          <Text style={styles.quickArrow}>›</Text>
        </AppCard>
      </Pressable>
    </Animated.View>
  );
}

function MatchCard({ match, teams }: { match: MatchModel; teams: Team[] }) {
  const home = getTeam(teams, match.homeTeamId);
  const away = getTeam(teams, match.awayTeamId);
  const isFinished = match.status === 'finalizado';
  const today = !isFinished && isToday(match.scheduledAt);
  const tomorrow = !isFinished && !today && isTomorrow(match.scheduledAt);

  return (
    <AppCard style={styles.matchCard}>
      <View style={styles.matchTopRow}>
        <Text style={styles.micro}>Rodada {match.round}</Text>
        {match.status === 'ao_vivo' && <Badge label="AO VIVO" variant="live" />}
        {today && <Badge label="HOJE" variant="gold" />}
        {tomorrow && <Badge label="AMANHÃ" variant="pending" />}
      </View>
      <View style={styles.matchTeams}>
        <View style={styles.matchTeamLeft}>
          <TeamColorDot color={home?.primaryColor ?? colors.textMuted} />
          <Text style={styles.matchTeamName} numberOfLines={1}>{home?.name ?? 'Time A'}</Text>
        </View>
        <Text style={isFinished ? styles.matchScore : styles.matchVs}>
          {isFinished ? `${match.homeScore ?? 0} × ${match.awayScore ?? 0}` : 'vs'}
        </Text>
        <View style={styles.matchTeamRight}>
          <Text style={styles.matchTeamName} numberOfLines={1}>{away?.name ?? 'Time B'}</Text>
          <TeamColorDot color={away?.primaryColor ?? colors.textMuted} />
        </View>
      </View>
      <Text style={[styles.matchDate, !match.scheduledAt && styles.matchDateMuted]}>
        {formatScheduledAt(match.scheduledAt)}
      </Text>
    </AppCard>
  );
}

function ResultCard({ match, teams }: { match: MatchModel; teams: Team[] }) {
  const home = getTeam(teams, match.homeTeamId);
  const away = getTeam(teams, match.awayTeamId);
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const homeWon = homeScore > awayScore;
  const awayWon = awayScore > homeScore;
  const draw = homeScore === awayScore;

  return (
    <AppCard style={styles.resultCard}>
      <Text style={styles.resultRound}>Rodada {match.round}</Text>
      <View style={styles.resultRow}>
        <TeamColorDot color={home?.primaryColor ?? colors.textMuted} size={8} />
        <Text
          style={[
            styles.resultTeam,
            homeWon && styles.resultWinner,
            (awayWon || draw) && styles.resultMuted,
          ]}
          numberOfLines={1}
        >
          {home?.name ?? 'Time A'}
        </Text>
        <Text style={styles.resultScore}>{homeScore}</Text>
        <Text style={styles.resultDivider}>×</Text>
        <Text style={styles.resultScore}>{awayScore}</Text>
        <Text
          style={[
            styles.resultTeam,
            awayWon && styles.resultWinner,
            (homeWon || draw) && styles.resultMuted,
          ]}
          numberOfLines={1}
        >
          {away?.name ?? 'Time B'}
        </Text>
        <TeamColorDot color={away?.primaryColor ?? colors.textMuted} size={8} />
      </View>
    </AppCard>
  );
}

function TeamSection({
  role,
  activeChampionship,
}: {
  role: UserRole;
  activeChampionship?: Championship;
}) {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const championships = useChampionshipStore((s) => s.championships);

  const myPlayer = players.find((player) => player.userId === user?.id);
  const myTeam =
    role === 'capitao'
      ? teams.find((team) => team.captainId === user?.id)
      : myPlayer
        ? teams.find((team) => team.id === myPlayer.teamId)
        : undefined;
  const myChamp = myTeam
    ? championships.find((championship) => championship.id === myTeam.championshipId)
    : activeChampionship;

  if (!myTeam) {
    const isAthlete = role === 'atleta';
    const isCaptain = role === 'capitao';

    return (
      <View style={styles.section}>
        <SectionHeader title="MEU TIME" />
        <AppCard variant="elevated" style={styles.emptyTeamCard}>
          <Text style={styles.emptyTitle}>Você ainda não está em um time</Text>
          <Text style={styles.emptyDescription}>
            {isAthlete
              ? 'Peça ao seu capitão o código de convite do time e use-o para entrar.'
              : isCaptain
              ? 'Crie um time e inscreva-o em um campeonato aberto.'
              : 'Acesse "Mais" para criar ou gerenciar campeonatos.'}
          </Text>
          {isAthlete && (
            <TouchableOpacity
              style={styles.emptyActionBtn}
              onPress={() => navigation.navigate('JoinTeam')}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyActionBtnText}>Usar código de convite</Text>
            </TouchableOpacity>
          )}
          {isCaptain && (
            <TouchableOpacity
              style={styles.emptyActionBtn}
              onPress={() => navigation.navigate('AvailableChampionships')}
              activeOpacity={0.8}
            >
              <Text style={styles.emptyActionBtnText}>Ver campeonatos disponíveis</Text>
            </TouchableOpacity>
          )}
        </AppCard>
      </View>
    );
  }

  if (myTeam.status === 'pendente') {
    return (
      <View style={styles.section}>
        <SectionHeader title="MEU TIME" />
        <AppCard variant="elevated" style={styles.teamCard}>
          <View style={styles.teamRow}>
            <TeamColorDot color={myTeam.primaryColor} size={12} />
            <Text style={styles.teamTitle} numberOfLines={1}>{myTeam.name}</Text>
          </View>
          <Text style={styles.teamChampName} numberOfLines={1}>
            {myChamp?.name ?? 'Campeonato'}
          </Text>
          <View style={styles.statusBanner}>
            <Text style={styles.statusBannerIcon}>⏳</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusBannerTitle}>Aguardando aprovação</Text>
              <Text style={styles.statusBannerDesc}>
                O organizador ainda não aprovou seu time. Aguarde o contato.
              </Text>
            </View>
          </View>
        </AppCard>
      </View>
    );
  }

  if (myTeam.status === 'rejeitado') {
    return (
      <View style={styles.section}>
        <SectionHeader title="MEU TIME" />
        <AppCard variant="elevated" style={styles.teamCard}>
          <View style={styles.teamRow}>
            <TeamColorDot color={myTeam.primaryColor} size={12} />
            <Text style={styles.teamTitle} numberOfLines={1}>{myTeam.name}</Text>
          </View>
          <Text style={styles.teamChampName} numberOfLines={1}>
            {myChamp?.name ?? 'Campeonato'}
          </Text>
          <View style={[styles.statusBanner, styles.statusBannerDanger]}>
            <Text style={styles.statusBannerIcon}>❌</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.statusBannerTitle, styles.statusBannerTitleDanger]}>
                Time rejeitado
              </Text>
              <Text style={styles.statusBannerDesc}>
                Entre em contato com o organizador do campeonato.
              </Text>
            </View>
          </View>
        </AppCard>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <SectionHeader title="MEU TIME" />
      <AppCard variant="elevated" style={styles.teamCard}>
        <View style={styles.teamRow}>
          <TeamColorDot color={myTeam.primaryColor} size={12} />
          <Text style={styles.teamTitle} numberOfLines={1}>{myTeam.name}</Text>
          <Badge label="APROVADO" variant="approved" />
        </View>
        <Text style={styles.teamChampName} numberOfLines={1}>
          {myChamp?.name ?? 'Campeonato'}
        </Text>
        {role === 'atleta' && myPlayer && (
          <Text style={styles.playerLine}>
            {myPlayer.name} · #{myPlayer.number} · {myPlayer.position}
          </Text>
        )}
        <Pressable
          onPress={() => {
            if (role === 'atleta' && myPlayer) {
              navigation.navigate('PlayerCard', {
                playerId: myPlayer.id,
                championshipId: myTeam.championshipId,
              });
            } else {
              navigation.navigate('ManageRoster', { teamId: myTeam.id });
            }
          }}
          style={styles.cardLinkWrap}
        >
          <Text style={styles.cardLink}>
            {role === 'atleta' ? 'Ver meu card ›' : 'Gerenciar elenco ›'}
          </Text>
        </Pressable>
      </AppCard>
    </View>
  );
}

function OrganizerChampionshipsSection({
  championships,
  teams,
  matches,
}: {
  championships: Championship[];
  teams: Team[];
  matches: MatchModel[];
}) {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const myChamps = championships.filter((championship) => championship.organizerId === user?.id);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');

  const STATUS_FILTERS = [
    { key: 'todos', label: 'Todos' },
    { key: 'em_andamento', label: 'Em andamento' },
    { key: 'inscricoes_abertas', label: 'Inscrições abertas' },
    { key: 'finalizado', label: 'Finalizados' },
  ];

  const filteredChamps = useMemo(() => {
    return myChamps.filter((c) => {
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'todos' || c.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [myChamps, searchQuery, statusFilter]);

  return (
    <View style={styles.section}>
      <SectionHeader
        title="MEUS CAMPEONATOS"
        action={{ text: 'Novo +', onPress: () => navigation.navigate('CreateChampionship') }}
      />

      <SearchBar
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Buscar campeonato..."
        onClear={() => setSearchQuery('')}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChips}
      >
        {STATUS_FILTERS.map((filter) => {
          const isActive = statusFilter === filter.key;
          return (
            <TouchableOpacity
              key={filter.key}
              onPress={() => setStatusFilter(filter.key)}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filteredChamps.length === 0 ? (
        <View style={styles.emptySearchWrap}>
          <EmptyState
            icon="🔍"
            title="Nenhum campeonato encontrado"
            description={searchQuery ? `Sem resultados para "${searchQuery}"` : 'Nenhum campeonato neste filtro'}
          />
        </View>
      ) : (
        <View style={styles.organizerList}>
          {filteredChamps.map((championship) => {
            const teamsCount = teams.filter((team) => team.championshipId === championship.id).length;
            const matchesCount = matches.filter((match) => match.championshipId === championship.id).length;
            const progress =
              championship.totalRounds > 0
                ? championship.currentRound / championship.totalRounds
                : 0;

            return (
              <Pressable
                key={championship.id}
                onPress={() =>
                  navigation.navigate('ChampionshipDashboard', { championshipId: championship.id })
                }
              >
                <AppCard variant="elevated" style={styles.championshipCard}>
                  <View style={styles.championshipTop}>
                    <Text style={styles.championshipTitle} numberOfLines={1}>
                      {championship.name}
                    </Text>
                    {getStatusBadge(championship)}
                  </View>
                  <Text style={styles.championshipMeta}>
                    {teamsCount} times · {matchesCount} partidas
                  </Text>
                  <LinearProgress value={progress} style={styles.championshipProgress} />
                </AppCard>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function RoleSwitcherModal({
  visible,
  currentRole,
  onClose,
}: {
  visible: boolean;
  currentRole: UserRole;
  onClose: () => void;
}) {
  const setRole = useAuthStore((s) => s.setRole);
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Trocar perfil</Text>
          <Text style={styles.modalSubtitle}>Selecione como deseja entrar</Text>
          <View style={styles.roleList}>
            {ROLE_OPTIONS.map(({ role, icon, label, desc }) => {
              const active = role === currentRole;
              return (
                <TouchableOpacity
                  key={role}
                  style={[styles.roleOption, active && styles.roleOptionActive]}
                  activeOpacity={0.8}
                  onPress={() => {
                    setRole(role);
                    onClose();
                  }}
                >
                  <Text style={styles.roleOptionIcon}>{icon}</Text>
                  <View style={styles.roleOptionInfo}>
                    <Text style={[styles.roleOptionLabel, active && styles.roleOptionLabelActive]}>
                      {label}
                    </Text>
                    <Text style={styles.roleOptionDesc}>{desc}</Text>
                  </View>
                  {active && (
                    <View style={styles.roleOptionCheck}>
                      <Ionicons name="checkmark" size={14} color={colors.textOnAccent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity
            style={styles.logoutBtn}
            activeOpacity={0.7}
            onPress={() => {
              onClose();
              signOut();
            }}
          >
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OrganizerFab() {
  const navigation = useNavigation<NavProp>();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View entering={SlideInRight.delay(600).duration(420)} style={[styles.fabWrap, animatedStyle]}>
      <Pressable
        onPress={() => navigation.navigate('CreateChampionship')}
        onPressIn={() => {
          scale.value = withSpring(0.9, { damping: 16, stiffness: 260 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 16, stiffness: 260 });
        }}
      >
        <LinearGradient colors={gradients.accent} style={styles.fab}>
          <Ionicons name="add" size={28} color={colors.textPrimary} />
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

function ChampionshipSelectorModal({
  visible,
  championships,
  selectedId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  championships: Championship[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Selecionar campeonato</Text>
          <Text style={styles.modalSubtitle}>Escolha qual campeonato exibir</Text>
          <View style={styles.roleList}>
            {championships.map((champ) => {
              const active = champ.id === selectedId;
              return (
                <TouchableOpacity
                  key={champ.id}
                  style={[styles.roleOption, active && styles.roleOptionActive]}
                  activeOpacity={0.8}
                  onPress={() => {
                    onSelect(champ.id);
                    onClose();
                  }}
                >
                  <Ionicons name="trophy-outline" size={22} color={active ? colors.accent : colors.textSecondary} />
                  <View style={styles.roleOptionInfo}>
                    <Text style={[styles.roleOptionLabel, active && styles.roleOptionLabelActive]} numberOfLines={1}>
                      {champ.name}
                    </Text>
                    <Text style={styles.roleOptionDesc}>
                      {champ.status === 'em_andamento' ? 'Em andamento' : champ.status === 'inscricoes_abertas' ? 'Inscrições abertas' : 'Finalizado'}
                    </Text>
                  </View>
                  {active && (
                    <View style={styles.roleOptionCheck}>
                      <Ionicons name="checkmark" size={14} color={colors.textOnAccent} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'atleta';
  const championships = useChampionshipStore((s) => s.championships);
  const isLoading = useChampionshipStore((s) => s.loading);
  const selectedChampionshipId = useChampionshipStore((s) => s.selectedChampionshipId) ?? '';
  const setSelectedChampionshipId = useChampionshipStore((s) => s.setSelectedChampionshipId);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const matches = useMatchStore((s) => s.matches);
  const myPlayer = useMemo(
    () => players.find((p) => p.userId === user?.id),
    [players, user?.id],
  );
  const { unreadCount: inAppUnread } = useNotificationBadge();
  const { unreadCount: announcementsUnread } = useAnnouncementsBadge(selectedChampionshipId);
  const unreadCount = inAppUnread + announcementsUnread;
  const [modalVisible, setModalVisible] = useState(false);
  const [champSelectorVisible, setChampSelectorVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const scrollY = useSharedValue(0);

  // Dualidade Atleta/Capitão: um atleta também é capitão se tiver algum time seu.
  const captainTeam = useMemo(
    () => teams.find((t) => t.captainId === user?.id),
    [teams, user?.id],
  );
  const isCaptain = !!captainTeam;

  const activeChampionship = useMemo(
    () =>
      championships.find((c) => c.id === selectedChampionshipId) ??
      championships.find((c) => c.status === 'em_andamento') ??
      championships.find((c) => c.status === 'inscricoes_abertas') ??
      championships[0],
    [championships, selectedChampionshipId],
  );

  // Pull-to-refresh handler
  const onRefresh = useCallback(async () => {
    if (!activeChampionship?.id) return;
    setRefreshing(true);
    try {
      const champId = activeChampionship.id;
      const [freshMatches, freshTeams, freshPlayers] = await Promise.all([
        getCollection<MatchModel>('matches', [{ field: 'championshipId', operator: '==', value: champId }]),
        getCollection<Team>('teams', [{ field: 'championshipId', operator: '==', value: champId }]),
        getCollection<Player>('players', [{ field: 'championshipId', operator: '==', value: champId }]),
      ]);
      // Merge fresh data into stores
      const prevMatches = useMatchStore.getState().matches.filter((m) => m.championshipId !== champId);
      useMatchStore.getState().setMatches([...prevMatches, ...freshMatches]);
      const prevTeams = useTeamStore.getState().teams.filter((t) => t.championshipId !== champId);
      const prevPlayers = useTeamStore.getState().players.filter((p) => p.championshipId !== champId);
      useTeamStore.getState().setTeams([...prevTeams, ...freshTeams]);
      useTeamStore.setState({ players: [...prevPlayers, ...freshPlayers] });
    } catch (e) {
      console.warn('[HomeScreen] onRefresh error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [activeChampionship?.id]);

  const championshipTeams = useMemo(
    () =>
      activeChampionship
        ? teams.filter((team) => team.championshipId === activeChampionship.id)
        : [],
    [activeChampionship, teams],
  );

  const championshipMatches = useMemo(
    () =>
      activeChampionship
        ? matches.filter((match) => match.championshipId === activeChampionship.id)
        : [],
    [activeChampionship, matches],
  );

  const upcomingMatches = useMemo(
    () =>
      championshipMatches
        .filter((match) => match.status !== 'finalizado')
        .sort((a, b) => {
          if (a.scheduledAt && !b.scheduledAt) return -1;
          if (!a.scheduledAt && b.scheduledAt) return 1;
          if (a.scheduledAt && b.scheduledAt) {
            return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
          }
          return 0;
        })
        .slice(0, 6),
    [championshipMatches],
  );
  const latestResults = championshipMatches
    .filter((match) => match.status === 'finalizado')
    .slice()
    .sort((a, b) => b.round - a.round)
    .slice(0, 5);

  // Finished championships (history)
  const finishedChampionships = useMemo(
    () => championships.filter((c) => c.status === 'finalizado').slice(0, 6),
    [championships],
  );
  const { results: historyResults } = useChampionshipHistory();

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {role !== 'organizador' && (
        <RoleSwitcherModal
          visible={modalVisible}
          currentRole={role}
          onClose={() => setModalVisible(false)}
        />
      )}
      {championships.length > 1 && (
        <ChampionshipSelectorModal
          visible={champSelectorVisible}
          championships={championships}
          selectedId={selectedChampionshipId || null}
          onSelect={setSelectedChampionshipId}
          onClose={() => setChampSelectorVisible(false)}
        />
      )}

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.bg200}
            title="Atualizando..."
            titleColor={colors.textSecondary}
          />
        }
      >
        <StickyHeader
          userName={user?.name}
          userPhotoUrl={myPlayer?.photoUrl}
          unreadCount={unreadCount}
          isOrganizer={role === 'organizador'}
          onOpenRoleSwitcher={() => setModalVisible(true)}
          onAvatarPress={() => navigation.navigate('AthleteProfile')}
          onBellPress={() => navigation.navigate('NotificationCenter')}
          onSearchPress={() => navigation.navigate('GlobalSearch')}
          shadowProgress={scrollY}
        />

        {!isLoading && championships.length > 1 && (
          <TouchableOpacity
            style={styles.champSelector}
            onPress={() => setChampSelectorVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="trophy-outline" size={15} color={colors.accent} />
            <Text style={styles.champSelectorText} numberOfLines={1}>
              {activeChampionship?.name ?? 'Selecionar campeonato'}
            </Text>
            <Ionicons name="chevron-down" size={15} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        {isLoading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonLoader width="100%" height={160} borderRadius={0} />
            <View style={styles.skeletonQuickRow}>
              <SkeletonLoader width="47%" height={80} borderRadius={16} />
              <SkeletonLoader width="47%" height={80} borderRadius={16} />
            </View>
          </View>
        ) : (
          <HeroCard championship={activeChampionship} teamsCount={championshipTeams.length} />
        )}

        {!isLoading && role === 'organizador' && (
          <OrganizerChampionshipsSection
            championships={championships}
            teams={teams}
            matches={matches}
          />
        )}

        {!isLoading && role === 'atleta' && (
          <View style={styles.section}>
            <RoleContextSwitch
              isCaptain={isCaptain}
              captainTeamName={captainTeam?.name}
              onCreateTeam={() => navigation.navigate('AvailableChampionships')}
            />
          </View>
        )}

        {!isLoading && (role === 'capitao' || role === 'atleta') && (
          <TeamSection role={role} activeChampionship={activeChampionship} />
        )}

        <View style={styles.section}>
          <SectionHeader title="ACESSO RÁPIDO" />
          <View style={styles.quickGrid}>
            <QuickAccessCard
              icon="calendar-outline"
              title="Confrontos"
              onPress={() => navigateToTab(navigation, 'Confrontos')}
            />
            <QuickAccessCard
              icon="trophy-outline"
              title="Classificação"
              onPress={() => navigateToTab(navigation, 'Classificação')}
            />
            <QuickAccessCard
              icon="target"
              title="Artilheiros"
              iconFamily="feather"
              onPress={() => navigateToTab(navigation, 'Artilheiros')}
            />
            <QuickAccessCard
              icon="bar-chart-outline"
              title="Estatísticas"
              onPress={() => navigateToTab(navigation, 'Mais')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <SectionHeader
            title="PRÓXIMAS PARTIDAS"
            action={{ text: 'Ver todas ›', onPress: () => navigateToTab(navigation, 'Confrontos') }}
          />
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            data={upcomingMatches.length > 0 ? upcomingMatches : championshipMatches.slice(0, 4)}
            keyExtractor={(item) => item.id}
            renderItem={({ item: match }) => <MatchCard match={match} teams={teams} />}
          />
        </View>

        {latestResults.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="ÚLTIMOS RESULTADOS" />
            <View style={styles.resultsList}>
              {latestResults.map((match) => (
                <ResultCard key={match.id} match={match} teams={teams} />
              ))}
            </View>
          </View>
        )}

        {finishedChampionships.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="HISTÓRICO"
              action={{
                text: 'Ver todos ›',
                onPress: () => navigation.navigate('ChampionshipHistory'),
              }}
            />
            <AppCard
              variant="accent"
              style={styles.rankingHistCard}
              onPress={() => navigation.navigate('AllTimeRankings')}
            >
              <View style={styles.rankingHistRow}>
                <View style={styles.rankingHistText}>
                  <Text style={styles.rankingHistTitle}>🏅 Ranking Histórico</Text>
                  <Text style={styles.rankingHistSub}>Veja os maiores da FJU de todos os tempos</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.accent} />
              </View>
            </AppCard>
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalList}
              data={finishedChampionships}
              keyExtractor={(item) => item.id}
              renderItem={({ item: championship }) => (
                <ChampionshipHistoryCard
                  championship={championship}
                  result={historyResults[championship.id]}
                  onPress={() => navigation.navigate('Season', { championshipId: championship.id })}
                />
              )}
            />
          </View>
        )}
      </Animated.ScrollView>

      {role === 'organizador' && <OrganizerFab />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  content: {
    paddingBottom: 110,
  },
  stickyHeader: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    backgroundColor: colors.bg200,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    zIndex: 10,
  },
  userCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.accent,
  },
  avatarText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.accent,
  },
  hello: {
    flex: 1,
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textPrimary,
  },
  organizerCluster: {
    flex: 1,
  },
  organizerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  organizerBadgeText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    letterSpacing: 0.5,
    color: colors.accent,
    textTransform: 'uppercase',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  bellWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBadge: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  unreadBubble: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  unreadBubbleText: {
    fontFamily: 'Barlow-Bold',
    fontSize: 9,
    color: '#FFFFFF',
  },
  heroCard: {
    minHeight: 160,
    padding: 20,
    marginTop: 8,
    overflow: 'hidden',
  },
  heroAccentLine: {
    width: 60,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginBottom: 14,
  },
  heroTrophy: {
    position: 'absolute',
    right: 16,
    top: 24,
    opacity: 0.15,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  heroTitle: {
    maxWidth: '78%',
    fontFamily: 'Barlow-Bold',
    fontSize: 22,
    lineHeight: 26,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    marginTop: 6,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  heroProgressBlock: {
    marginTop: 18,
  },
  progressCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  roundText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    color: colors.textPrimary,
  },
  roundPercent: {
    fontFamily: 'Barlow-Bold',
    fontSize: 12,
    color: colors.accent,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.bg300,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  section: {
    marginTop: 22,
    paddingHorizontal: 20,
  },
  teamCard: {
    marginTop: 12,
    padding: 16,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamTitle: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  teamChampName: {
    marginTop: 10,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  playerLine: {
    marginTop: 8,
    fontFamily: 'Barlow-Regular',
    fontSize: 15,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  cardLinkWrap: {
    alignSelf: 'flex-end',
    marginTop: 14,
  },
  cardLink: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.accent,
  },
  emptyTeamCard: {
    marginTop: 12,
    padding: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
    backgroundColor: '#FFF8EC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F5A623',
    padding: 12,
  },
  statusBannerDanger: {
    backgroundColor: '#FFF0F0',
    borderColor: '#E74C3C',
  },
  statusBannerIcon: {
    fontSize: 20,
    marginTop: 1,
  },
  statusBannerTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: '#B87A00',
  },
  statusBannerTitleDanger: {
    color: '#C0392B',
  },
  statusBannerDesc: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  emptyTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  emptyDescription: {
    marginTop: 6,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  emptyActionBtn: {
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.accentGlow,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  emptyActionBtnText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.accent,
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  quickCardWrap: {
    width: '47%',
  },
  quickCard: {
    height: 80,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  quickIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentGlow,
  },
  quickTitle: {
    flex: 1,
    fontFamily: 'Barlow-Bold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  quickArrow: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 22,
    color: colors.accent,
  },
  rankingHistCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 16,
  },
  rankingHistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankingHistText: {
    flex: 1,
    gap: 2,
  },
  rankingHistTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  rankingHistSub: {
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  horizontalList: {
    gap: 12,
    paddingTop: 12,
    paddingRight: 20,
  },
  matchCard: {
    width: 200,
    height: 110,
    padding: 12,
    borderRadius: 14,
  },
  matchTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  micro: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  matchTeams: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  matchTeamName: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 12,
    color: colors.textPrimary,
  },
  matchScore: {
    fontFamily: 'Barlow-Black',
    fontSize: 17,
    color: colors.accent,
  },
  matchVs: {
    fontFamily: 'Barlow-Bold',
    fontSize: 13,
    color: colors.textMuted,
  },
  matchDate: {
    fontFamily: 'Barlow-Regular',
    fontSize: 11,
    color: colors.textSecondary,
  },
  matchDateMuted: {
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  resultsList: {
    gap: 10,
    marginTop: 12,
  },
  resultCard: {
    padding: 12,
  },
  resultRound: {
    marginBottom: 6,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  resultTeam: {
    flex: 1,
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
  },
  resultWinner: {
    color: colors.textPrimary,
    fontFamily: 'Barlow-Bold',
  },
  resultMuted: {
    color: colors.textSecondary,
  },
  resultScore: {
    fontFamily: 'Barlow-Black',
    fontSize: 22,
    color: colors.textPrimary,
    minWidth: 20,
    textAlign: 'center',
  },
  resultDivider: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textMuted,
  },
  organizerList: {
    gap: 12,
    marginTop: 12,
  },
  filterChips: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.bg300,
  },
  filterChipActive: {
    backgroundColor: colors.accent,
  },
  filterChipText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.bg100,
  },
  emptySearchWrap: {
    minHeight: 180,
    justifyContent: 'center',
    marginTop: 12,
  },
  championshipCard: {
    minHeight: 90,
    padding: 14,
  },
  championshipTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  championshipTitle: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 18,
    color: colors.textPrimary,
  },
  championshipMeta: {
    marginTop: 8,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  championshipProgress: {
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg200,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 20,
    color: colors.textPrimary,
  },
  modalSubtitle: {
    marginTop: 4,
    marginBottom: 20,
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  roleList: {
    gap: 10,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
  },
  roleOptionActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  roleOptionIcon: {
    fontSize: 28,
  },
  roleOptionInfo: {
    flex: 1,
  },
  roleOptionLabel: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  roleOptionLabelActive: {
    color: colors.accent,
  },
  roleOptionDesc: {
    marginTop: 2,
    fontFamily: 'Barlow-Regular',
    fontSize: 12,
    color: colors.textSecondary,
  },
  roleOptionCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  logoutBtn: {
    marginTop: 20,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  logoutText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 14,
    color: colors.danger,
  },
  fabWrap: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    ...shadows.shadowGlow,
  },
  skeletonWrap: {
    marginTop: 8,
    gap: 12,
  },
  skeletonQuickRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    gap: 12,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  champSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  champSelectorText: {
    flex: 1,
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textPrimary,
  },
});
