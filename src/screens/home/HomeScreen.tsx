import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const QUICK_ITEM_SIZE = Dimensions.get('window').width / 4 - 20;
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuthStore } from '../../stores/authStore';
import { UserRole } from '../../types';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { AppCard } from '../../components/AppCard';
import { AppButton } from '../../components/AppButton';
import { colors } from '../../theme/colors';
import { Championship, Team } from '../../types';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const ROLE_LABELS: Record<string, string> = {
  organizador: 'Organizador',
  capitao: 'Capitão',
  atleta: 'Atleta',
};

const STATUS_LABELS: Record<string, string> = {
  inscricoes_abertas: 'Inscrições abertas',
  em_andamento: 'Em andamento',
  finalizado: 'Finalizado',
};

const STATUS_COLORS: Record<string, string> = {
  inscricoes_abertas: colors.warning,
  em_andamento: colors.success,
  finalizado: colors.textSecondary,
};

const QUICK_ACCESS: { icon: IoniconName; label: string; color: string }[] = [
  { icon: 'calendar-outline', label: 'Confrontos',    color: colors.primaryDark },
  { icon: 'trophy-outline',   label: 'Classificação', color: colors.accent },
  { icon: 'football-outline', label: 'Artilheiros',   color: colors.primaryDark },
  { icon: 'bar-chart-outline',label: 'Estatísticas',  color: colors.primaryDark },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function ChampionshipCard({ champ, onPress }: { champ: Championship; onPress?: () => void }) {
  const stripeColor = colors.accent;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.champCardOuter}>
      <View style={styles.champCardInner}>
        <View style={[styles.champStripe, { backgroundColor: stripeColor }]} />
        <View style={styles.champCardBody}>
          <View style={styles.champCardHeader}>
            <Text style={styles.champName} numberOfLines={1}>{champ.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COLORS[champ.status]}26` }]}>
              <Text style={[styles.statusText, { color: STATUS_COLORS[champ.status] }]}>
                {STATUS_LABELS[champ.status]}
              </Text>
            </View>
          </View>
          <View style={styles.champStats}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{champ.currentRound}</Text>
              <Text style={styles.statLabel}>Rodada atual</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{champ.totalRounds}</Text>
              <Text style={styles.statLabel}>Total rodadas</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, styles.statValueGold]}>{champ.inviteCode}</Text>
              <Text style={styles.statLabel}>Código</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function TeamCard({ team, onPress }: { team: Team; onPress: () => void }) {
  return (
    <AppCard onPress={onPress} style={styles.teamCard}>
      <View style={styles.teamCardRow}>
        <View style={styles.teamColors}>
          <View style={[styles.colorDot, { backgroundColor: team.primaryColor }]} />
          <View style={[styles.colorDot, { backgroundColor: team.secondaryColor }]} />
        </View>
        <View style={styles.teamInfo}>
          <Text style={styles.teamName}>{team.name}</Text>
          <View style={[styles.statusBadge, team.status === 'aprovado' ? styles.badgeAprovado : styles.badgePendente]}>
            <Text style={[styles.statusText, team.status === 'aprovado' ? styles.textAprovado : styles.textPendente]}>
              {team.status === 'aprovado' ? 'Aprovado' : 'Aguardando aprovação'}
            </Text>
          </View>
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </AppCard>
  );
}

// ── Role sections ─────────────────────────────────────────────────────────────

function OrganizerSection() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const championships = useChampionshipStore((s) => s.championships);
  const myChamps = championships.filter((c) => c.organizerId === user?.id);

  return (
    <>
      {myChamps.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {myChamps.length === 1 ? 'MEU CAMPEONATO' : 'MEUS CAMPEONATOS'}
          </Text>
          <View style={styles.cardList}>
            {myChamps.map((c) => (
              <ChampionshipCard
                key={c.id}
                champ={c}
                onPress={() => navigation.navigate('ChampionshipDashboard', { championshipId: c.id })}
              />
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <AppCard style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>Nenhum campeonato ainda</Text>
            <Text style={styles.emptyDesc}>
              Toque no + para criar o primeiro campeonato.
            </Text>
          </AppCard>
        </View>
      )}
    </>
  );
}

function CaptainSection() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const { teams, players } = useTeamStore();
  const championships = useChampionshipStore((s) => s.championships);

  const myTeam = teams.find((t) => t.captainId === user?.id);
  const myChamp = myTeam ? championships.find((c) => c.id === myTeam.championshipId) : null;
  const rosterCount = myTeam ? players.filter((p) => p.teamId === myTeam.id).length : 0;

  if (myTeam) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MEU TIME</Text>
        <TeamCard
          team={myTeam}
          onPress={() => navigation.navigate('ManageRoster', { teamId: myTeam.id })}
        />
        {myChamp && (
          <View style={styles.champTagRow}>
            <Text style={styles.champTag}>🏆 {myChamp.name}</Text>
            <Text style={styles.champTag}>⚽ {rosterCount} atletas</Text>
          </View>
        )}
        <AppButton
          title="Gerenciar elenco"
          variant="outline"
          onPress={() => navigation.navigate('ManageRoster', { teamId: myTeam.id })}
          style={styles.manageBtn}
        />
        <AppButton
          title="Ver campeonatos abertos"
          variant="ghost"
          onPress={() => navigation.navigate('AvailableChampionships')}
          style={styles.manageBtn}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <AppCard style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>🛡️</Text>
        <Text style={styles.emptyTitle}>Sem time inscrito</Text>
        <Text style={styles.emptyDesc}>
          Inscreva seu time em um campeonato aberto.
        </Text>
        <AppButton
          title="Inscrever meu time"
          onPress={() => navigation.navigate('AvailableChampionships')}
          style={styles.emptyAction}
          fullWidth
        />
      </AppCard>
    </View>
  );
}

function AthleteSection() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const { players, teams } = useTeamStore();
  const championships = useChampionshipStore((s) => s.championships);

  const myPlayer = players.find((p) => p.userId === user?.id);
  const myTeam = myPlayer ? teams.find((t) => t.id === myPlayer.teamId) : null;
  const myChamp = myTeam ? championships.find((c) => c.id === myTeam.championshipId) : null;

  if (myPlayer && myTeam) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>MEU TIME</Text>
        <AppCard style={styles.playerCard}>
          <View style={styles.playerCardRow}>
            <View style={styles.teamColors}>
              <View style={[styles.colorDot, { backgroundColor: myTeam.primaryColor }]} />
              <View style={[styles.colorDot, { backgroundColor: myTeam.secondaryColor }]} />
            </View>
            <View style={styles.teamInfo}>
              <Text style={styles.teamName}>{myTeam.name}</Text>
              {myChamp && <Text style={styles.champTagSmall}>{myChamp.name}</Text>}
            </View>
          </View>
          <View style={styles.playerInfo}>
            <Text style={styles.playerName}>{myPlayer.name}</Text>
            <Text style={styles.playerMeta}>#{myPlayer.number} · {myPlayer.position}</Text>
          </View>
        </AppCard>
        <AppButton
          title="Ver meu card"
          variant="outline"
          onPress={() =>
            navigation.navigate('PlayerCard', {
              playerId: myPlayer.id,
              championshipId: myTeam.championshipId,
            })
          }
          style={styles.manageBtn}
        />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <AppCard style={styles.emptyCard}>
        <Text style={styles.emptyIcon}>⚽</Text>
        <Text style={styles.emptyTitle}>Você ainda não é de nenhum time</Text>
        <Text style={styles.emptyDesc}>
          Peça o código ao capitão e entre no seu time.
        </Text>
        <AppButton
          title="Entrar em um time"
          onPress={() => navigation.navigate('JoinTeam')}
          style={styles.emptyAction}
          fullWidth
        />
      </AppCard>
    </View>
  );
}

// ── Role switcher modal ───────────────────────────────────────────────────────

const ROLE_OPTIONS: { role: UserRole; icon: string; label: string; desc: string }[] = [
  { role: 'organizador', icon: '📋', label: 'Organizador', desc: 'Gerencia campeonatos e aprova times' },
  { role: 'capitao',     icon: '🛡️', label: 'Capitão',    desc: 'Inscreve e gerencia o elenco do time' },
  { role: 'atleta',      icon: '⚽', label: 'Atleta',     desc: 'Acompanha jogos e estatísticas' },
];

function RoleSwitcherModal({ visible, currentRole, onClose }: {
  visible: boolean;
  currentRole: UserRole;
  onClose: () => void;
}) {
  const switchRole = useAuthStore((s) => s.switchRole);
  const logout = useAuthStore((s) => s.logout);

  function handleSelect(role: UserRole) {
    switchRole(role);
    onClose();
  }

  function handleLogout() {
    onClose();
    logout();
  }

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
                  onPress={() => handleSelect(role)}
                >
                  <Text style={styles.roleOptionIcon}>{icon}</Text>
                  <View style={styles.roleOptionInfo}>
                    <Text style={[styles.roleOptionLabel, active && styles.roleOptionLabelActive]}>
                      {label}
                    </Text>
                    <Text style={styles.roleOptionDesc}>{desc}</Text>
                  </View>
                  {active && <View style={styles.roleOptionCheck}><Text style={styles.checkMark}>✓</Text></View>}
                </TouchableOpacity>
              );
            })}
          </View>
          <TouchableOpacity style={styles.logoutBtn} activeOpacity={0.7} onPress={handleLogout}>
            <Text style={styles.logoutText}>Sair</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const user = useAuthStore((s) => s.user);
  const role = user?.role ?? 'atleta';
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <RoleSwitcherModal
        visible={modalVisible}
        currentRole={role}
        onClose={() => setModalVisible(false)}
      />

      {/* Dark hero header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Olá, {user?.name}! 👋</Text>
          <Text style={styles.champSubtitle}>Copa Tribo de Judá 2026</Text>
          <TouchableOpacity
            style={styles.roleBadge}
            activeOpacity={0.75}
            onPress={() => setModalVisible(true)}
          >
            <Text style={styles.roleText}>{ROLE_LABELS[role]}</Text>
          </TouchableOpacity>
        </View>
        <Ionicons name="trophy" size={44} color={colors.accent} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Role-specific section */}
        {role === 'organizador' && <OrganizerSection />}
        {role === 'capitao' && <CaptainSection />}
        {role === 'atleta' && <AthleteSection />}

        {/* Quick access */}
        <View style={[styles.section, styles.sectionQuickAccess]}>
          <Text style={styles.sectionLabel}>ACESSO RÁPIDO</Text>
          <View style={styles.quickGrid}>
            {QUICK_ACCESS.map((item) => (
              <TouchableOpacity key={item.label} style={styles.quickItem} activeOpacity={0.8}>
                <Ionicons name={item.icon} size={28} color={item.color} />
                <Text style={styles.quickLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* FAB — organizador only */}
      {role === 'organizador' && (
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('CreateChampionship')}
        >
          <Ionicons name="add" size={28} color={colors.textOnAccent} />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.primaryDark },
  scrollView: { flex: 1, backgroundColor: colors.surface },
  content: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 8 },

  // Hero header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
    minHeight: 200,
  },
  greeting: { fontSize: 26, fontWeight: '800', color: colors.textOnDark, marginBottom: 4 },
  champSubtitle: { fontSize: 13, color: colors.accent, marginTop: 4, marginBottom: 12 },
  roleBadge: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  roleText: { fontSize: 12, fontWeight: '600', color: colors.textOnAccent },

  // Sections
  section: { marginTop: 24 },
  sectionQuickAccess: { marginTop: 20 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#9E9E9E',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  cardList: { gap: 12 },

  // Championship card
  champCardOuter: {
    borderRadius: 16,
    backgroundColor: colors.background,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    elevation: 2,
  },
  champCardInner: { borderRadius: 16, overflow: 'hidden' },
  champStripe: { height: 3 },
  champCardBody: { padding: 16, gap: 14 },
  champCardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  champName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: '600' },
  champStats: { flexDirection: 'row', alignItems: 'center' },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1A1A1A', letterSpacing: 0.5 },
  statValueGold: { color: colors.accent, fontSize: 16 },
  statLabel: { fontSize: 11, color: '#9E9E9E', marginTop: 2, textAlign: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: '#E8E8E8' },

  // Team card
  teamCard: {},
  teamCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  teamColors: { flexDirection: 'row', gap: 4 },
  colorDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
  teamInfo: { flex: 1, gap: 4 },
  teamName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  chevron: { fontSize: 24, color: colors.accent, fontWeight: '600' },
  badgeAprovado: { backgroundColor: `${colors.success}26` },
  badgePendente: { backgroundColor: `${colors.warning}26` },
  textAprovado: { color: colors.success },
  textPendente: { color: colors.warning },
  champTagRow: { flexDirection: 'row', gap: 12, marginTop: 10 },
  champTag: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  champTagSmall: { fontSize: 12, color: colors.textSecondary },
  manageBtn: { marginTop: 10 },

  // Player card (atleta)
  playerCard: { gap: 12 },
  playerCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  playerInfo: {},
  playerName: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  playerMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },

  // Empty state card
  emptyCard: { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
  emptyDesc: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  emptyAction: { marginTop: 8 },

  // Quick access
  quickGrid: { flexDirection: 'row', gap: 10 },
  quickItem: {
    width: QUICK_ITEM_SIZE,
    height: QUICK_ITEM_SIZE,
    backgroundColor: colors.background,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 12,
    elevation: 4,
  },
  quickLabel: { fontSize: 11, fontWeight: '500', color: colors.textSecondary, textAlign: 'center' },

  // Role switcher modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  modalSubtitle: { fontSize: 13, color: colors.textSecondary, marginBottom: 20 },
  roleList: { gap: 10 },
  roleOption: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 14, backgroundColor: colors.surface },
  roleOptionActive: { backgroundColor: `${colors.accent}18`, borderWidth: 1.5, borderColor: colors.accent },
  roleOptionIcon: { fontSize: 28 },
  roleOptionInfo: { flex: 1 },
  roleOptionLabel: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  roleOptionLabelActive: { color: colors.accent },
  roleOptionDesc: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  roleOptionCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  checkMark: { fontSize: 13, color: colors.textOnAccent, fontWeight: '700' },
  logoutBtn: { marginTop: 20, paddingVertical: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.borderLight },
  logoutText: { fontSize: 14, fontWeight: '600', color: colors.danger },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 88,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 8,
  },
});
