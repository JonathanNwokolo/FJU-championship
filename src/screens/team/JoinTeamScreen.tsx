import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Toast from 'react-native-toast-message';
import { AppButton } from '../../components/AppButton';
import { SearchBar } from '../../components/SearchBar';
import { EmptyState } from '../../components/EmptyState';
import { SegmentedTabs } from '../../components/SegmentedTabs';
import { HomeStackParamList } from '../../navigation/HomeStackNavigator';
import { useAuthStore } from '../../stores/authStore';
import { useChampionshipStore } from '../../stores/championshipStore';
import { useTeamStore } from '../../stores/teamStore';
import { joinByCode, requestToJoin, joinWaitlist, getWaitlistPosition } from '../../services/inviteService';
import { countActivePlayersInTeam } from '../../utils/teamRules';
import { colors } from '../../theme/colors';
import { Team } from '../../types';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'JoinTeam'>;
type RouteType = RouteProp<HomeStackParamList, 'JoinTeam'>;
type JoinMode = 'code' | 'search';

export function JoinTeamScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RouteType>();
  const user = useAuthStore((s) => s.user);
  const teams = useTeamStore((s) => s.teams);
  const players = useTeamStore((s) => s.players);
  const championships = useChampionshipStore((s) => s.championships);
  const selectedChampionshipId = useChampionshipStore((s) => s.selectedChampionshipId);

  const [mode, setMode] = useState<JoinMode>('code');
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [search, setSearch] = useState('');
  const [requestingTeamId, setRequestingTeamId] = useState<string | null>(null);
  const [showWaitlistOption, setShowWaitlistOption] = useState(false);
  const [waitlistTeamCode, setWaitlistTeamCode] = useState('');
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);

  const activeChampionshipId =
    route.params?.championshipId ??
    selectedChampionshipId ??
    championships.find((item) => item.status === 'em_andamento')?.id ??
    championships.find((item) => item.status === 'inscricoes_abertas')?.id ??
    championships[0]?.id ??
    '';

  const searchableTeams = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return teams
      .filter((team) => team.championshipId === activeChampionshipId)
      .filter((team) => team.status === 'aprovado')
      .filter((team) => (team.registrationOpen ?? true) === true)
      .filter((team) => !normalized || team.name.toLowerCase().includes(normalized))
      .slice(0, 20);
  }, [activeChampionshipId, search, teams]);

  const getCaptainName = (team: Team) => {
    const captain = players.find((player) => player.userId === team.captainId);
    return captain?.name ?? 'Capitão do time';
  };

  const getAvailableSlots = (team: Team) => {
    // sem_time/removido mantêm o teamId antigo no doc — não ocupam vaga.
    const rosterSize = countActivePlayersInTeam(players, team.id);
    const maxPlayers = team.maxPlayers ?? 15;
    return Math.max(0, maxPlayers - rosterSize);
  };

  const handleJoinByCode = async () => {
    if (!user?.id) return;
    if (code.trim().length < 6) {
      Toast.show({
        type: 'error',
        text1: 'Digite um código válido',
        visibilityTime: 2000,
      });
      return;
    }

    setJoining(true);
    setShowWaitlistOption(false);
    try {
      const result = await joinByCode(code, user.id, user.name);
      if (result === 'success') {
        Toast.show({
          type: 'success',
          text1: 'Você entrou no time!',
          text2: 'Seu cadastro foi concluído com sucesso.',
          visibilityTime: 2200,
        });
        navigation.navigate('HomeMain');
        return;
      }

      // Handle full team - show waitlist option
      if (result === 'full') {
        setWaitlistTeamCode(code.trim().toUpperCase());
        setShowWaitlistOption(true);
        Toast.show({
          type: 'info',
          text1: 'Time lotado',
          text2: 'Você pode entrar na lista de espera.',
          visibilityTime: 3000,
        });
        return;
      }

      if (result === 'team_not_approved') {
        Toast.show({
          type: 'error',
          text1: 'Time ainda não aprovado',
          text2: 'Aguarde o organizador aprovar o time antes de entrar.',
          visibilityTime: 2800,
        });
        return;
      }

      const messages: Record<'not_found' | 'already_member' | 'closed' | 'already_in_championship' | 'championship_closed', { text1: string; text2?: string }> = {
        not_found: {
          text1: 'Código não encontrado',
          text2: 'Confira com o capitão e tente novamente.',
        },
        already_member: {
          text1: 'Você já faz parte desse time',
        },
        already_in_championship: {
          text1: 'Você já está em outro time',
          text2: 'Você já participa deste campeonato em outro time.',
        },
        closed: {
          text1: 'Inscrições fechadas',
          text2: 'O capitão fechou temporariamente as entradas.',
        },
        championship_closed: {
          text1: 'Inscrições encerradas',
          text2: 'As inscrições para este campeonato estão encerradas.',
        },
      };

      Toast.show({
        type: result === 'already_member' ? 'info' : 'error',
        text1: messages[result].text1,
        text2: messages[result].text2,
        visibilityTime: 2500,
      });
    } catch (error) {
      console.warn('[JoinTeamScreen] joinByCode failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Não foi possível entrar agora',
        text2: 'Tente novamente em instantes.',
        visibilityTime: 2400,
      });
    } finally {
      setJoining(false);
    }
  };

  const handleRequestToJoin = async (team: Team) => {
    if (!user?.id) return;
    setRequestingTeamId(team.id);
    try {
      const result = await requestToJoin(team.id, user.id, user.name);
      
      if (result === 'success') {
        Toast.show({
          type: 'success',
          text1: 'Solicitação enviada!',
          text2: 'Aguarde a aprovação do capitão.',
          visibilityTime: 2200,
        });
        return;
      }

      const requestMessages: Record<string, { type: 'error' | 'info'; text1: string; text2?: string }> = {
        already_pending: { type: 'info', text1: 'Solicitação já enviada', text2: 'Aguarde a resposta do capitão.' },
        already_member: { type: 'info', text1: 'Você já faz parte desse time' },
        already_in_championship: { type: 'error', text1: 'Você já está em outro time', text2: 'Você já participa deste campeonato em outro time.' },
        full: { type: 'error', text1: 'Time lotado', text2: 'Este time não tem mais vagas.' },
        closed: { type: 'error', text1: 'Inscrições fechadas', text2: 'O time não está aceitando novos membros.' },
        team_not_found: { type: 'error', text1: 'Time não encontrado' },
        team_not_approved: { type: 'error', text1: 'Time ainda não aprovado', text2: 'Aguarde o organizador aprovar o time antes de solicitar entrada.' },
        championship_closed: { type: 'error', text1: 'Inscrições encerradas', text2: 'As inscrições para este campeonato estão encerradas.' },
      };

      const msg = requestMessages[result] ?? { type: 'error', text1: 'Não foi possível enviar a solicitação' };
      Toast.show({ ...msg, visibilityTime: 2400 });
    } catch (error) {
      console.warn('[JoinTeamScreen] requestToJoin failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Não foi possível enviar a solicitação',
        visibilityTime: 2400,
      });
    } finally {
      setRequestingTeamId(null);
    }
  };

  const handleJoinWaitlist = async () => {
    if (!user?.id || !waitlistTeamCode) return;
    
    setJoiningWaitlist(true);
    try {
      // Find team by invite code
      const team = teams.find(t => t.inviteCode === waitlistTeamCode);
      if (!team) {
        Toast.show({
          type: 'error',
          text1: 'Time não encontrado',
          visibilityTime: 2000,
        });
        return;
      }

      const result = await joinWaitlist(team.id, user.id, user.name);
      
      if (result === 'success') {
        const position = await getWaitlistPosition(team.id, user.id);
        Toast.show({
          type: 'success',
          text1: 'Você entrou na lista de espera!',
          text2: `Posição: ${position}º · Você será notificado quando uma vaga abrir.`,
          visibilityTime: 4000,
        });
        setShowWaitlistOption(false);
        setCode('');
      } else if (result === 'already_waiting') {
        const position = await getWaitlistPosition(team.id, user.id);
        Toast.show({
          type: 'info',
          text1: 'Você já está na lista de espera',
          text2: `Posição atual: ${position}º`,
          visibilityTime: 3000,
        });
      } else {
        Toast.show({
          type: 'error',
          text1: 'Não foi possível entrar na lista',
          visibilityTime: 2000,
        });
      }
    } catch (error) {
      console.warn('[JoinTeamScreen] joinWaitlist failed:', error);
      Toast.show({
        type: 'error',
        text1: 'Erro ao entrar na lista de espera',
        visibilityTime: 2400,
      });
    } finally {
      setJoiningWaitlist(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Entrar em um time</Text>
          <Text style={styles.heroSubtitle}>
            Use um código compartilhado pelo capitão ou solicite sua entrada.
          </Text>
        </View>

        <SegmentedTabs
          tabs={[
            { key: 'code', label: 'Codigo manual', icon: 'keypad-outline' },
            { key: 'search', label: 'Buscar time', icon: 'search-outline' },
          ]}
          activeKey={mode}
          onChange={(key) => setMode(key as JoinMode)}
          style={styles.segmentedTabs}
        />

        <View style={styles.hiddenTabs}>
          <TouchableOpacity
            onPress={() => setMode('code')}
            style={[styles.modeTab, mode === 'code' && styles.modeTabActive]}
          >
            <Text style={[styles.modeTabText, mode === 'code' && styles.modeTabTextActive]}>
              Código manual
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode('search')}
            style={[styles.modeTab, mode === 'search' && styles.modeTabActive]}
          >
            <Text style={[styles.modeTabText, mode === 'search' && styles.modeTabTextActive]}>
              Buscar time
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'code' ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>CÓDIGO DE CONVITE</Text>
            <TextInput
              style={styles.codeInput}
              value={code}
              onChangeText={(value) => setCode(value.toUpperCase())}
              placeholder="FJU4X2"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
            />
            <AppButton
              title={joining ? 'Entrando...' : 'Entrar no time'}
              onPress={handleJoinByCode}
              fullWidth
              disabled={joining}
            />
            
            {/* Waitlist Option */}
            {showWaitlistOption && (
              <View style={styles.waitlistCard}>
                <View style={styles.waitlistIcon}>
                  <Text style={styles.waitlistIconText}>⏳</Text>
                </View>
                <Text style={styles.waitlistTitle}>Time lotado</Text>
                <Text style={styles.waitlistDesc}>
                  Este time está com todas as vagas preenchidas. Você pode entrar na lista de espera 
                  e será notificado quando uma vaga abrir.
                </Text>
                <AppButton
                  title={joiningWaitlist ? 'Entrando...' : 'Entrar na lista de espera'}
                  onPress={handleJoinWaitlist}
                  variant="outline"
                  fullWidth
                  disabled={joiningWaitlist}
                />
              </View>
            )}
          </View>
        ) : (
          <View style={styles.searchModeWrap}>
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar time pelo nome..."
              onClear={() => setSearch('')}
            />
            <FlatList
              data={searchableTeams}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => {
                const availableSlots = getAvailableSlots(item);
                return (
                  <View style={styles.teamRow}>
                    <View style={styles.teamMeta}>
                      <View style={styles.colorRow}>
                        <View style={[styles.teamDot, { backgroundColor: item.primaryColor }]} />
                        <Text style={styles.teamName}>{item.name}</Text>
                      </View>
                      <Text style={styles.teamDetails}>
                        {getCaptainName(item)} · {availableSlots} vagas disponíveis
                      </Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => handleRequestToJoin(item)}
                      style={styles.requestButton}
                      disabled={requestingTeamId === item.id}
                    >
                      {requestingTeamId === item.id ? (
                        <ActivityIndicator size="small" color={colors.textOnAccent} />
                      ) : (
                        <Text style={styles.requestButtonText}>Solicitar entrada</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              }}
              ListEmptyComponent={
                <EmptyState
                  icon="🔎"
                  title="Nenhum time encontrado"
                  description="Ajuste a busca ou aguarde novos times com inscrições abertas."
                />
              }
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg100,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  hero: {
    marginBottom: 20,
    gap: 6,
  },
  heroTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 24,
    color: colors.textPrimary,
  },
  heroSubtitle: {
    fontFamily: 'Barlow-Regular',
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  segmentedTabs: {
    marginBottom: 18,
  },
  hiddenTabs: {
    display: 'none',
  },
  modeTab: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeTabActive: {
    backgroundColor: colors.accentGlow,
    borderColor: colors.accent,
  },
  modeTabText: {
    fontFamily: 'Barlow-Medium',
    fontSize: 13,
    color: colors.textSecondary,
  },
  modeTabTextActive: {
    fontFamily: 'Barlow-SemiBold',
    color: colors.accent,
  },
  card: {
    marginTop: 18,
    gap: 14,
    padding: 20,
    borderRadius: 18,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionTitle: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 12,
    letterSpacing: 1.4,
    color: colors.textSecondary,
  },
  codeInput: {
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.bg300,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
    fontFamily: 'Barlow-Black',
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: 6,
  },
  searchModeWrap: {
    flex: 1,
    marginTop: 18,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 20,
    flexGrow: 1,
  },
  teamRow: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.bg200,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  teamMeta: {
    gap: 6,
  },
  colorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teamDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  teamName: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  teamDetails: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
  },
  requestButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  requestButtonText: {
    fontFamily: 'Barlow-SemiBold',
    fontSize: 13,
    color: colors.textOnAccent,
  },

  // Waitlist styles
  waitlistCard: {
    marginTop: 16,
    padding: 20,
    borderRadius: 16,
    backgroundColor: `${colors.warning}15`,
    borderWidth: 1,
    borderColor: colors.warning,
    alignItems: 'center',
    gap: 12,
  },
  waitlistIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${colors.warning}22`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitlistIconText: {
    fontSize: 24,
  },
  waitlistTitle: {
    fontFamily: 'Barlow-Bold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  waitlistDesc: {
    fontFamily: 'Barlow-Regular',
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
});
