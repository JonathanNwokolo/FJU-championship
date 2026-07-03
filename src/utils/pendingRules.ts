/**
 * Bloco 8 — Central de Pendências.
 *
 * Funções puras para derivar pendências a partir dos dados já existentes nos
 * stores Zustand. Nenhuma chamada a Firestore, nenhuma lógica nova de negócio.
 * As regras consumidas (elegibilidade, status de partida, membership) vêm dos
 * utils já testados; este módulo apenas transforma dados em PendingItem[].
 */

import {
  Championship,
  MatchModel,
  Player,
  Team,
  Convocation,
  MatchAttendance,
  AppUser,
  UserRole,
} from '../types';
import {
  PendingDeadlineTag,
  PendingDestination,
  PendingGroup,
  PendingItem,
  PendingItemCategory,
  PendingItemSeverity,
  PENDING_CATEGORY_LABELS,
} from '../types/pending';
import { isActiveRosterPlayer } from './teamRules';
import { canCompleteGroupStage } from './groupStageTransition';
import {
  getKnockoutMatches,
  hasGeneratedGroups,
  hasGeneratedKnockout,
  normalizeGroupId,
  validateGroupsKnockoutStructure,
} from './groupStageStructure';
import { isGroupsKnockoutChampionship, MIN_APPROVED_TEAMS_FOR_GROUPS } from './groupStageRules';

// ── IDs determinísticos ───────────────────────────────────────────────────────

export function pendingId(type: string, ...parts: string[]): string {
  return [type, ...parts].join('_');
}

// ── Helpers de prazo ──────────────────────────────────────────────────────────

const MS_24H = 24 * 60 * 60 * 1000;
const MS_72H = 72 * 60 * 60 * 1000;

export function deadlineTag(
  dueAt: string | null | undefined,
  now: Date = new Date(),
): PendingDeadlineTag {
  if (!dueAt) return 'no_deadline';
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return 'no_deadline';
  const diff = due.getTime() - now.getTime();
  if (diff < 0) return 'overdue';
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  if (due < startOfTomorrow) return 'today';
  if (diff <= MS_24H) return 'within_24h';
  if (diff <= MS_72H) return 'within_72h';
  return 'no_deadline';
}

/** true se a data já passou em relação a agora */
export function isOverdue(dueAt: string | null | undefined, now: Date = new Date()): boolean {
  return deadlineTag(dueAt, now) === 'overdue';
}

/** true se a partida está atrasada (agendado + scheduledAt no passado) */
export function isMatchOverdue(match: MatchModel, now: Date = new Date()): boolean {
  return (
    match.status === 'agendado' &&
    !!match.scheduledAt &&
    new Date(match.scheduledAt).getTime() < now.getTime()
  );
}

// ── Ordenação ─────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<PendingItemSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const DEADLINE_ORDER: Record<PendingDeadlineTag, number> = {
  overdue: 0,
  today: 1,
  within_24h: 2,
  within_72h: 3,
  no_deadline: 4,
};

/**
 * Ordenação por:
 * 1. bloqueio crítico (isBlocked)
 * 2. prazo vencido
 * 3. prazo mais próximo
 * 4. severidade
 * 5. dueAt (absoluto)
 * 6. título (desempate estável)
 */
export function sortPendingItems(items: PendingItem[]): PendingItem[] {
  const unique = new Map<string, PendingItem>();
  for (const item of items) {
    if (!unique.has(item.id)) unique.set(item.id, item);
  }

  return [...unique.values()].sort((a, b) => {
    // Bloqueados primeiro
    if (a.isBlocked && !b.isBlocked) return -1;
    if (!a.isBlocked && b.isBlocked) return 1;

    // Prazo vencido primeiro
    const deadA = DEADLINE_ORDER[a.deadlineTag ?? 'no_deadline'];
    const deadB = DEADLINE_ORDER[b.deadlineTag ?? 'no_deadline'];
    if (deadA !== deadB) return deadA - deadB;

    // Severidade
    const sevA = SEVERITY_ORDER[a.severity];
    const sevB = SEVERITY_ORDER[b.severity];
    if (sevA !== sevB) return sevA - sevB;

    // Data absoluta (mais cedo primeiro)
    if (a.dueAt && b.dueAt) {
      const diff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (diff !== 0) return diff;
    }
    if (a.dueAt && !b.dueAt) return -1;
    if (!a.dueAt && b.dueAt) return 1;

    // Desempate estável pelo título
    return a.title.localeCompare(b.title, 'pt-BR');
  });
}

// ── Agrupamento ───────────────────────────────────────────────────────────────

const CATEGORY_ORDER: PendingItemCategory[] = [
  'championship',
  'teams',
  'matches',
  'convocations',
  'attendance',
  'roster',
  'admin',
];

export function groupPendingItems(items: PendingItem[]): PendingGroup[] {
  const map = new Map<PendingItemCategory, PendingItem[]>();
  for (const item of items) {
    const existing = map.get(item.category) ?? [];
    existing.push(item);
    map.set(item.category, existing);
  }
  return CATEGORY_ORDER.filter((cat) => map.has(cat)).map((cat) => ({
    category: cat,
    label: PENDING_CATEGORY_LABELS[cat],
    items: sortPendingItems(map.get(cat)!),
  }));
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function makeItem(
  partial: Omit<PendingItem, 'deadlineTag'> & { dueAt?: string },
): PendingItem {
  return {
    ...partial,
    deadlineTag: partial.dueAt ? deadlineTag(partial.dueAt) : 'no_deadline',
  };
}

// ── PARTE 2 — Derivação do Organizador ───────────────────────────────────────

export interface OrganizerPendingInput {
  user: AppUser;
  championships: Championship[];
  teams: Team[];
  players: Player[];
  matches: MatchModel[];
  convocations: Convocation[];
  activeChampionshipId?: string | null;
  now?: Date;
}

export function deriveOrganizerPendingItems(input: OrganizerPendingInput): PendingItem[] {
  const {
    user,
    championships,
    teams,
    players,
    matches,
    convocations,
    activeChampionshipId,
    now = new Date(),
  } = input;

  const myChampionships = championships.filter(
    (c) =>
      c.organizerId === user.id &&
      (!activeChampionshipId || c.id === activeChampionshipId),
  );
  const myChampIds = new Set(myChampionships.map((c) => c.id));
  const myTeams = teams.filter((t) => myChampIds.has(t.championshipId));
  const myMatches = matches.filter((m) => myChampIds.has(m.championshipId));
  const myPlayers = players.filter((p) => p.championshipId && myChampIds.has(p.championshipId));

  const items: PendingItem[] = [];

  // ── Times ──────────────────────────────────────────────────────────────────

  for (const team of myTeams) {
    const champ = myChampionships.find((c) => c.id === team.championshipId);

    // Time aguardando aprovação
    if (team.status === 'pendente') {
      items.push(makeItem({
        id: pendingId('team_pending_approval', team.id),
        role: 'organizador',
        type: 'team_pending_approval',
        category: 'teams',
        severity: 'high',
        title: `Time aguardando aprovação`,
        description: `${team.name} está aguardando aprovação no campeonato ${champ?.name ?? '—'}.`,
        actionLabel: 'Revisar time',
        destination: champ
          ? { type: 'championship_manage', championshipId: champ.id }
          : undefined,
        championshipId: team.championshipId,
        championshipName: champ?.name,
        teamId: team.id,
        teamName: team.name,
      }));
    }

    // Time aprovado sem capitão válido (captainId sem userId correspondente)
    if (team.status === 'aprovado') {
      const captainPlayer = myPlayers.find(
        (p) => p.userId === team.captainId && p.teamId === team.id && isActiveRosterPlayer(p),
      );
      if (!captainPlayer) {
        items.push(makeItem({
          id: pendingId('team_no_valid_captain', team.id),
          role: 'organizador',
          type: 'team_no_valid_captain',
          category: 'teams',
          severity: 'medium',
          title: `Time sem capitão ativo`,
          description: `${team.name} está aprovado mas não tem capitão com atleta ativo no elenco.`,
          championshipId: team.championshipId,
          championshipName: champ?.name,
          teamId: team.id,
          teamName: team.name,
        }));
      }
    }
  }

  // ── Campeonatos ────────────────────────────────────────────────────────────

  for (const champ of myChampionships) {
    const champTeams = myTeams.filter((t) => t.championshipId === champ.id);
    const approvedTeams = champTeams.filter((t) => t.status === 'aprovado');
    const champMatches = myMatches.filter((m) => m.championshipId === champ.id);

    // Inscrições abertas perto do prazo
    if (champ.status === 'inscricoes_abertas' && champ.registrationDeadline) {
      const tag = deadlineTag(champ.registrationDeadline, now);
      if (tag === 'overdue' || tag === 'today' || tag === 'within_24h' || tag === 'within_72h') {
        const sevMap: Record<PendingDeadlineTag, PendingItemSeverity> = {
          overdue: 'critical',
          today: 'high',
          within_24h: 'high',
          within_72h: 'medium',
          no_deadline: 'info',
        };
        items.push(makeItem({
          id: pendingId('championship_deadline_near', champ.id),
          role: 'organizador',
          type: 'championship_deadline_near',
          category: 'championship',
          severity: sevMap[tag],
          title: `Prazo de inscrições ${tag === 'overdue' ? 'vencido' : 'próximo'}`,
          description: `As inscrições de ${champ.name} ${tag === 'overdue' ? 'encerraram' : 'encerram em breve'}.`,
          dueAt: champ.registrationDeadline,
          destination: { type: 'championship_manage', championshipId: champ.id },
          championshipId: champ.id,
          championshipName: champ.name,
        }));
      }
    }

    // Campeonato sem times suficientes (ainda inscricoes abertas ou em andamento)
    if (champ.status !== 'finalizado' && approvedTeams.length < 2) {
      items.push(makeItem({
        id: pendingId('championship_no_teams', champ.id),
        role: 'organizador',
        type: 'championship_no_teams',
        category: 'championship',
        severity: 'medium',
        title: `Campeonato com poucos times aprovados`,
        description: `${champ.name} tem apenas ${approvedTeams.length} time(s) aprovado(s). São necessários pelo menos 2 para gerar partidas.`,
        destination: { type: 'championship_manage', championshipId: champ.id },
        championshipId: champ.id,
        championshipName: champ.name,
      }));
    }

    // Em andamento sem fixtures
    if (champ.status === 'em_andamento' && champMatches.length === 0) {
      items.push(makeItem({
        id: pendingId('championship_no_fixtures', champ.id),
        role: 'organizador',
        type: 'championship_no_fixtures',
        category: 'championship',
        severity: 'critical',
        title: `Campeonato em andamento sem partidas`,
        description: `${champ.name} está em andamento mas nenhuma partida foi gerada.`,
        isBlocked: true,
        destination: { type: 'championship_manage', championshipId: champ.id },
        championshipId: champ.id,
        championshipName: champ.name,
      }));
    }

    // Campeonato finalizável (em andamento, todas as partidas liquidadas)
    if (champ.status === 'em_andamento' && champMatches.length > 0) {
      const allSettled = champMatches.every(
        (m) => m.status === 'finalizado' || m.status === 'wo' || m.status === 'cancelado',
      );
      if (allSettled) {
        items.push(makeItem({
          id: pendingId('championship_finalizable', champ.id),
          role: 'organizador',
          type: 'championship_finalizable',
          category: 'championship',
          severity: 'medium',
          title: `Campeonato pronto para encerrar`,
          description: `Todas as partidas de ${champ.name} já foram encerradas. O campeonato pode ser finalizado.`,
          destination: { type: 'championship_manage', championshipId: champ.id },
          championshipId: champ.id,
          championshipName: champ.name,
        }));
      }
    }
  }

  // ── Partidas ───────────────────────────────────────────────────────────────

  for (const match of myMatches) {
    const champ = myChampionships.find((c) => c.id === match.championshipId);

    // Partida atrasada sem resultado
    if (isMatchOverdue(match, now)) {
      items.push(makeItem({
        id: pendingId('match_overdue', match.id),
        role: 'organizador',
        type: 'match_overdue',
        category: 'matches',
        severity: 'high',
        title: `Partida atrasada sem resultado`,
        description: `Rodada ${match.round} de ${champ?.name ?? '—'} passou da data sem resultado.`,
        dueAt: match.scheduledAt ?? undefined,
        isBlocked: true,
        destination: { type: 'match_prematch', matchId: match.id },
        championshipId: match.championshipId,
        championshipName: champ?.name,
        matchId: match.id,
      }));
    }

    // Partida adiada aguardando reagendamento
    if (match.status === 'adiado') {
      items.push(makeItem({
        id: pendingId('match_postponed_unscheduled', match.id),
        role: 'organizador',
        type: 'match_postponed_unscheduled',
        category: 'matches',
        severity: 'medium',
        title: `Partida adiada aguardando reagendamento`,
        description: `Rodada ${match.round} de ${champ?.name ?? '—'} está adiada e precisa de nova data.`,
        destination: { type: 'match_prematch', matchId: match.id },
        championshipId: match.championshipId,
        championshipName: champ?.name,
        matchId: match.id,
      }));
    }
  }

  // ── Convocações (dados carregados sob demanda) ─────────────────────────────

  const scheduledMatches = myMatches.filter((m) => m.status === 'agendado' || m.status === 'adiado');

  for (const match of scheduledMatches) {
    const champ = myChampionships.find((c) => c.id === match.championshipId);

    const homeConv = convocations.find(
      (c) => c.matchId === match.id && c.teamId === match.homeTeamId,
    );
    const awayConv = convocations.find(
      (c) => c.matchId === match.id && c.teamId === match.awayTeamId,
    );

    if (!homeConv) {
      items.push(makeItem({
        id: pendingId('match_no_convocation', match.id, match.homeTeamId),
        role: 'organizador',
        type: 'match_no_convocation',
        category: 'convocations',
        severity: 'high',
        title: `Time mandante sem convocação`,
        description: `Rodada ${match.round} de ${champ?.name ?? '—'}: time mandante ainda não criou convocação.`,
        dueAt: match.scheduledAt ?? undefined,
        destination: { type: 'match_prematch', matchId: match.id },
        championshipId: match.championshipId,
        championshipName: champ?.name,
        matchId: match.id,
        teamId: match.homeTeamId,
      }));
    }
    if (!awayConv) {
      items.push(makeItem({
        id: pendingId('match_no_convocation', match.id, match.awayTeamId),
        role: 'organizador',
        type: 'match_no_convocation',
        category: 'convocations',
        severity: 'high',
        title: `Time visitante sem convocação`,
        description: `Rodada ${match.round} de ${champ?.name ?? '—'}: time visitante ainda não criou convocação.`,
        dueAt: match.scheduledAt ?? undefined,
        destination: { type: 'match_prematch', matchId: match.id },
        championshipId: match.championshipId,
        championshipName: champ?.name,
        matchId: match.id,
        teamId: match.awayTeamId,
      }));
    }
  }

  return items;
}

// ── Bloco 10.4 — Helpers de grupos + mata-mata ───────────────────────────────

/**
 * Rótulo de contexto de fase para enriquecer descrições ("Grupo A", "Mata-mata").
 * Retorna null quando o campeonato não é grupos + mata-mata ou a partida não tem
 * fase reconhecível — nesse caso o texto genérico "rodada X" é mantido.
 */
export function matchPhaseLabel(match: MatchModel, championship?: Championship): string | null {
  if (!isGroupsKnockoutChampionship(championship)) return null;
  const groupId = normalizeGroupId(match.groupId, championship?.id);
  if (match.stage === 'group' || groupId) {
    return groupId ? `Grupo ${groupId}` : null;
  }
  if (match.stage === 'knockout' || match.bracketRound || match.knockoutRound != null) {
    return 'Mata-mata';
  }
  return null;
}

/**
 * Sufixo de contexto de fase (" Grupo A." / " Mata-mata.") para anexar a descrições
 * que já mencionam a rodada. Vazio quando não é partida de grupos + mata-mata.
 */
function groupContextSuffix(match: MatchModel, championship?: Championship): string {
  const label = matchPhaseLabel(match, championship);
  return label ? ` ${label}.` : '';
}

// Blockers de conclusão que exigem AÇÃO administrativa (não são apenas "partida
// ainda agendada / aguardando ser jogada"). Só estes viram card de fase bloqueada.
const OPERATIONAL_GROUP_BLOCKERS = new Set<string>([
  'postponed_group_match',
  'cancelled_group_match_unresolved',
  'invalid_score',
  'invalid_walkover',
  'live_match_exists',
  'duplicate_group_match',
  'group_match_cross_group',
  'partial_group_fixtures_detected',
  'fixtures_missing',
  'assignment_version_mismatch',
  'invalid_group_size',
  'team_missing_group',
  'incompatible_structure_version',
]);

export interface GroupStagePendingInput {
  user: AppUser;
  championships: Championship[];
  teams: Team[];
  matches: MatchModel[];
  activeChampionshipId?: string | null;
  now?: Date;
}

/**
 * Pendências do ORGANIZADOR específicas do formato grupos + mata-mata. Consome
 * exclusivamente utils já testados (canCompleteGroupStage, validateGroupsKnockout,
 * hasGeneratedGroups/Knockout). Sem query, sem listener, sem persistência.
 */
export function deriveGroupStagePendingItems(input: GroupStagePendingInput): PendingItem[] {
  const { user, championships, teams, matches, activeChampionshipId } = input;
  const items: PendingItem[] = [];

  const owned = championships.filter(
    (c) =>
      c.organizerId === user.id &&
      isGroupsKnockoutChampionship(c) &&
      (!activeChampionshipId || c.id === activeChampionshipId),
  );

  for (const champ of owned) {
    const approvedTeams = teams.filter(
      (t) => t.championshipId === champ.id && t.status === 'aprovado',
    );
    const champMatches = matches.filter((m) => m.championshipId === champ.id);
    const generatedGroups = hasGeneratedGroups(champ);
    const generatedKnockout = hasGeneratedKnockout(champ);
    const hasFixtures = (champ.groupFixturesVersion ?? 0) >= 1;

    // 3. Grupos ainda não gerados (campeonato apto).
    if (
      !generatedGroups &&
      !generatedKnockout &&
      champ.status === 'inscricoes_abertas' &&
      approvedTeams.length >= MIN_APPROVED_TEAMS_FOR_GROUPS
    ) {
      items.push(makeItem({
        id: pendingId('group_groups_not_generated', champ.id),
        role: 'organizador',
        type: 'group_groups_not_generated',
        category: 'championship',
        severity: 'high',
        title: 'Grupos ainda não sorteados',
        description: `${champ.name} tem ${approvedTeams.length} times aprovados. Sorteie os grupos para iniciar a fase.`,
        actionLabel: 'Sortear grupos',
        destination: { type: 'championship_manage', championshipId: champ.id },
        championshipId: champ.id,
        championshipName: champ.name,
      }));
      continue;
    }

    // 5. Estrutura inválida após geração (problemas acionáveis).
    if (generatedGroups) {
      const structure = validateGroupsKnockoutStructure({
        championship: champ,
        teams: approvedTeams,
        matches: champMatches,
      });
      if (structure.errors.length > 0) {
        items.push(makeItem({
          id: pendingId('group_structure_invalid', champ.id),
          role: 'organizador',
          type: 'group_structure_invalid',
          category: 'championship',
          severity: 'critical',
          title: 'Estrutura de grupos inconsistente',
          description: `A estrutura de grupos de ${champ.name} apresenta ${structure.errors.length} problema(s) que impedem a fase de avançar.`,
          isBlocked: true,
          actionLabel: 'Revisar grupos',
          destination: { type: 'groups_overview', championshipId: champ.id },
          championshipId: champ.id,
          championshipName: champ.name,
          metadata: { errorCount: structure.errors.length },
        }));
      }
    }

    // 4. Grupos gerados, fixtures ainda não.
    if (generatedGroups && !hasFixtures && !generatedKnockout) {
      items.push(makeItem({
        id: pendingId('group_fixtures_not_generated', champ.id),
        role: 'organizador',
        type: 'group_fixtures_not_generated',
        category: 'championship',
        severity: 'high',
        title: 'Fixtures de grupo não geradas',
        description: `Os grupos de ${champ.name} já foram sorteados, mas as partidas ainda não foram geradas.`,
        actionLabel: 'Gerar partidas',
        destination: { type: 'groups_overview', championshipId: champ.id },
        championshipId: champ.id,
        championshipName: champ.name,
      }));
    }

    // 7/8. Fase pronta ou bloqueada (só quando há fixtures e antes do mata-mata).
    if (generatedGroups && hasFixtures && !generatedKnockout) {
      const check = canCompleteGroupStage({
        championship: champ,
        teams: approvedTeams,
        matches: champMatches,
      });

      if (check.allowed) {
        items.push(makeItem({
          id: pendingId('group_stage_ready', champ.id),
          role: 'organizador',
          type: 'group_stage_ready',
          category: 'championship',
          severity: 'high',
          title: 'Fase de grupos pronta para conclusão',
          description: `Todas as partidas de grupo de ${champ.name} foram resolvidas. Revise a classificação e gere o mata-mata.`,
          actionLabel: 'Revisar e concluir',
          destination: { type: 'group_stage_review', championshipId: champ.id },
          championshipId: champ.id,
          championshipName: champ.name,
        }));
      } else {
        const operational = check.blockers.filter((b) => OPERATIONAL_GROUP_BLOCKERS.has(b.code));
        if (operational.length > 0) {
          items.push(makeItem({
            id: pendingId('group_stage_blocked', champ.id),
            role: 'organizador',
            type: 'group_stage_blocked',
            category: 'matches',
            severity: 'high',
            title: 'Fase de grupos bloqueada',
            description: `${operational.length} pendência(s) operacional(is) impedem a conclusão da fase de grupos de ${champ.name} (partidas adiadas, canceladas ou com placar inconsistente).`,
            isBlocked: true,
            actionLabel: 'Resolver partidas',
            destination: { type: 'group_stage_review', championshipId: champ.id },
            championshipId: champ.id,
            championshipName: champ.name,
            metadata: { blockerCount: operational.length },
          }));
        }
      }
    }

    // 9. Fase concluída mas mata-mata indisponível por inconsistência.
    if (champ.groupStageComplete && !generatedKnockout && getKnockoutMatches(champMatches, champ).length === 0) {
      items.push(makeItem({
        id: pendingId('group_knockout_not_generated', champ.id),
        role: 'organizador',
        type: 'group_knockout_not_generated',
        category: 'championship',
        severity: 'critical',
        title: 'Mata-mata não disponível',
        description: `A fase de grupos de ${champ.name} foi concluída, mas o chaveamento do mata-mata não está disponível. Verifique a estrutura antes de prosseguir.`,
        isBlocked: true,
        actionLabel: 'Revisar fase de grupos',
        destination: { type: 'group_stage_review', championshipId: champ.id },
        championshipId: champ.id,
        championshipName: champ.name,
      }));
    }
  }

  return items;
}

/**
 * Itens informativos de classificação para um time (capitão ou atleta). Derivados
 * do estado do campeonato/partidas já em store — sem snapshot, sem events. A
 * notificação real (team_qualified/eliminated) é emitida no service após o snapshot
 * persistido; aqui apenas refletimos o estado para a Central de Pendências.
 */
export function deriveTeamKnockoutItems(params: {
  role: 'capitao' | 'atleta';
  championship: Championship | undefined;
  team: Team;
  matches: MatchModel[];
  ownerId: string; // teamId (capitão) ou playerId (atleta), usado no ID determinístico
  now?: Date;
}): PendingItem[] {
  const { role, championship, team, matches, ownerId } = params;
  if (!isGroupsKnockoutChampionship(championship) || !championship) return [];
  if (!hasGeneratedKnockout(championship)) return [];

  const items: PendingItem[] = [];
  const knockoutMatches = getKnockoutMatches(matches, championship).filter(
    (m) => m.championshipId === championship.id,
  );
  const teamKnockoutMatches = knockoutMatches.filter(
    (m) => m.homeTeamId === team.id || m.awayTeamId === team.id,
  );
  const qualified = teamKnockoutMatches.length > 0;
  const participatedInGroups =
    !!normalizeGroupId(team.groupId, championship.id) || typeof team.groupAssignmentVersion === 'number';

  if (qualified) {
    items.push(makeItem({
      id: pendingId('team_qualified', championship.id, team.id),
      role,
      type: 'team_qualified',
      category: 'championship',
      severity: 'info',
      title: 'Time classificado para o mata-mata',
      description: `${team.name} se classificou na fase de grupos e avançou para o mata-mata.`,
      actionLabel: 'Ver chave',
      destination: { type: 'knockout_bracket', championshipId: championship.id },
      championshipId: championship.id,
      championshipName: championship.name,
      teamId: team.id,
      teamName: team.name,
    }));

    // Próxima partida eliminatória já com adversário definido.
    const nextDefined = teamKnockoutMatches
      .filter(
        (m) =>
          m.status === 'agendado' &&
          !!m.homeTeamId &&
          !!m.awayTeamId,
      )
      .sort((a, b) => a.round - b.round)[0];
    if (nextDefined) {
      const opponentId =
        nextDefined.homeTeamId === team.id ? nextDefined.awayTeamId : nextDefined.homeTeamId;
      items.push(makeItem({
        id: pendingId('knockout_match_defined', nextDefined.id, ownerId),
        role,
        type: 'knockout_match_defined',
        category: 'matches',
        severity: 'low',
        title: 'Próxima partida do mata-mata definida',
        description: `A partida eliminatória de ${team.name} já tem adversário definido.`,
        actionLabel: 'Ver partida',
        destination: { type: 'match_prematch', matchId: nextDefined.id },
        championshipId: championship.id,
        championshipName: championship.name,
        teamId: team.id,
        teamName: team.name,
        matchId: nextDefined.id,
        metadata: { opponentId },
      }));
    }
  } else if (participatedInGroups) {
    items.push(makeItem({
      id: pendingId('team_eliminated', championship.id, team.id),
      role,
      type: 'team_eliminated',
      category: 'championship',
      severity: 'info',
      title: 'Time eliminado na fase de grupos',
      description: `${team.name} não se classificou para o mata-mata de ${championship.name}.`,
      actionLabel: 'Ver classificação',
      destination: { type: 'groups_overview', championshipId: championship.id },
      championshipId: championship.id,
      championshipName: championship.name,
      teamId: team.id,
      teamName: team.name,
    }));
  }

  return items;
}

// ── PARTE 3 — Derivação do Capitão ───────────────────────────────────────────

export interface CaptainPendingInput {
  user: AppUser;
  championships: Championship[];
  teams: Team[];
  players: Player[];
  matches: MatchModel[];
  convocations: Convocation[];
  attendances: MatchAttendance[];
  activeChampionshipId?: string | null;
  joinRequestsCount?: number;
  now?: Date;
}

export function deriveCaptainPendingItems(input: CaptainPendingInput): PendingItem[] {
  const {
    user,
    championships,
    teams,
    players,
    matches,
    convocations,
    attendances,
    activeChampionshipId,
    joinRequestsCount = 0,
    now = new Date(),
  } = input;

  const myTeam = teams.find(
    (t) =>
      t.captainId === user.id &&
      (!activeChampionshipId || t.championshipId === activeChampionshipId),
  );
  if (!myTeam) return [];

  const champ = championships.find((c) => c.id === myTeam.championshipId);
  const roster = players.filter(
    (p) => p.teamId === myTeam.id && isActiveRosterPlayer(p),
  );
  const teamMatches = matches.filter(
    (m) => m.championshipId === myTeam.championshipId &&
      (m.homeTeamId === myTeam.id || m.awayTeamId === myTeam.id),
  );
  const upcomingMatches = teamMatches
    .filter((m) => m.status === 'agendado' || m.status === 'adiado')
    .sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
      return 0;
    });
  const nextMatch = upcomingMatches[0];

  const items: PendingItem[] = [];

  // Time pendente de aprovação
  if (myTeam.status === 'pendente') {
    items.push(makeItem({
      id: pendingId('captain_team_pending', myTeam.id),
      role: 'capitao',
      type: 'captain_team_pending',
      category: 'teams',
      severity: 'critical',
      title: `Time aguardando aprovação`,
      description: `${myTeam.name} ainda não foi aprovado pelo organizador do campeonato.`,
      isBlocked: true,
      championshipId: myTeam.championshipId,
      championshipName: champ?.name,
      teamId: myTeam.id,
      teamName: myTeam.name,
    }));
    // Time pendente bloqueia tudo — não derivar mais
    return items;
  }

  // Elenco vazio
  if (roster.length === 0) {
    items.push(makeItem({
      id: pendingId('captain_roster_empty', myTeam.id),
      role: 'capitao',
      type: 'captain_roster_empty',
      category: 'roster',
      severity: 'high',
      title: `Elenco vazio`,
      description: `${myTeam.name} não tem atletas no elenco. Convide jogadores para participar.`,
      actionLabel: 'Gerenciar elenco',
      destination: { type: 'roster_manage', teamId: myTeam.id },
      championshipId: myTeam.championshipId,
      championshipName: champ?.name,
      teamId: myTeam.id,
      teamName: myTeam.name,
    }));
  }

  // Atleta suspenso na próxima rodada
  if (nextMatch) {
    const suspendedInRound = roster.filter(
      (p) => p.status === 'suspenso' && p.suspendedRound === nextMatch.round,
    );
    for (const p of suspendedInRound) {
      items.push(makeItem({
        id: pendingId('captain_player_suspended', myTeam.id, p.id, String(nextMatch.round)),
        role: 'capitao',
        type: 'captain_player_suspended',
        category: 'roster',
        severity: 'high',
        title: `Atleta suspenso na próxima rodada`,
        description: `${p.name} está suspenso para a rodada ${nextMatch.round} e não pode ser convocado.`,
        destination: { type: 'roster_manage', teamId: myTeam.id },
        championshipId: myTeam.championshipId,
        championshipName: champ?.name,
        teamId: myTeam.id,
        teamName: myTeam.name,
        playerId: p.id,
      }));
    }
  }

  // Solicitações de entrada pendentes
  if (joinRequestsCount > 0) {
    items.push(makeItem({
      id: pendingId('captain_join_request', myTeam.id),
      role: 'capitao',
      type: 'captain_join_request',
      category: 'teams',
      severity: 'high',
      title: `Solicitações de entrada pendentes`,
      description: `${joinRequestsCount} atleta(s) aguardando aprovação para entrar em ${myTeam.name}.`,
      actionLabel: 'Revisar solicitações',
      destination: { type: 'join_requests_dashboard' },
      championshipId: myTeam.championshipId,
      championshipName: champ?.name,
      teamId: myTeam.id,
      teamName: myTeam.name,
    }));
  }

  // Próxima partida — convocação
  if (nextMatch) {
    const conv = convocations.find(
      (c) => c.matchId === nextMatch.id && c.teamId === myTeam.id,
    );

    if (!conv) {
      const tag = deadlineTag(nextMatch.scheduledAt, now);
      const sev: PendingItemSeverity =
        tag === 'overdue' || tag === 'today' || tag === 'within_24h' ? 'critical' : 'high';
      items.push(makeItem({
        id: pendingId('captain_convocation_missing', nextMatch.id, myTeam.id),
        role: 'capitao',
        type: 'captain_convocation_missing',
        category: 'convocations',
        severity: sev,
        title: `Convocação não criada`,
        description: `Você ainda não criou a convocação para a rodada ${nextMatch.round}.${groupContextSuffix(nextMatch, champ)}`,
        actionLabel: 'Criar convocação',
        dueAt: nextMatch.scheduledAt ?? undefined,
        destination: { type: 'match_prematch', matchId: nextMatch.id },
        championshipId: nextMatch.championshipId,
        championshipName: champ?.name,
        teamId: myTeam.id,
        teamName: myTeam.name,
        matchId: nextMatch.id,
      }));
    } else if (conv.status === 'open') {
      // Convocação aberta — verificar reconfirmação
      if (conv.requiresReconfirmation || nextMatch.status === 'adiado') {
        items.push(makeItem({
          id: pendingId('captain_convocation_reconfirmation', nextMatch.id, myTeam.id),
          role: 'capitao',
          type: 'captain_convocation_reconfirmation',
          category: 'convocations',
          severity: 'high',
          title: `Reconfirmação de presença necessária`,
          description: `A partida da rodada ${nextMatch.round} foi adiada. Os atletas precisam reconfirmar presença.`,
          actionLabel: 'Ver convocação',
          dueAt: nextMatch.scheduledAt ?? undefined,
          destination: { type: 'match_prematch', matchId: nextMatch.id },
          championshipId: nextMatch.championshipId,
          championshipName: champ?.name,
          teamId: myTeam.id,
          teamName: myTeam.name,
          matchId: nextMatch.id,
        }));
      }

      // Respostas pendentes dos convocados
      const pendingResponses = conv.playerIds.filter((pid) => {
        const att = attendances.find((a) => a.matchId === nextMatch.id && a.playerId === pid);
        return !att || att.response === 'pending' || att.reconfirmationRequired;
      });
      if (pendingResponses.length > 0) {
        items.push(makeItem({
          id: pendingId('captain_convocation_pending_responses', nextMatch.id, myTeam.id),
          role: 'capitao',
          type: 'captain_convocation_pending_responses',
          category: 'convocations',
          severity: 'medium',
          title: `Respostas de presença pendentes`,
          description: `${pendingResponses.length} atleta(s) convocado(s) ainda não confirmaram presença para a rodada ${nextMatch.round}.`,
          actionLabel: 'Ver convocação',
          dueAt: nextMatch.scheduledAt ?? undefined,
          destination: { type: 'match_prematch', matchId: nextMatch.id },
          championshipId: nextMatch.championshipId,
          championshipName: champ?.name,
          teamId: myTeam.id,
          teamName: myTeam.name,
          matchId: nextMatch.id,
        }));
      }

      // Atletas que recusaram
      const declined = conv.playerIds.filter((pid) => {
        const att = attendances.find((a) => a.matchId === nextMatch.id && a.playerId === pid);
        return att?.response === 'declined';
      });
      if (declined.length > 0) {
        items.push(makeItem({
          id: pendingId('captain_convocation_declined', nextMatch.id, myTeam.id),
          role: 'capitao',
          type: 'captain_convocation_declined',
          category: 'convocations',
          severity: 'high',
          title: `Atletas recusaram presença`,
          description: `${declined.length} atleta(s) recusaram a convocação para a rodada ${nextMatch.round}.`,
          actionLabel: 'Ver convocação',
          dueAt: nextMatch.scheduledAt ?? undefined,
          destination: { type: 'match_prematch', matchId: nextMatch.id },
          championshipId: nextMatch.championshipId,
          championshipName: champ?.name,
          teamId: myTeam.id,
          teamName: myTeam.name,
          matchId: nextMatch.id,
        }));
      }
    }

    // Partida adiada
    if (nextMatch.status === 'adiado') {
      items.push(makeItem({
        id: pendingId('captain_match_postponed', nextMatch.id),
        role: 'capitao',
        type: 'captain_match_postponed',
        category: 'matches',
        severity: 'medium',
        title: `Partida adiada`,
        description: `A partida da rodada ${nextMatch.round} foi adiada. Fique atento ao novo horário.`,
        destination: { type: 'match_fixtures' },
        championshipId: nextMatch.championshipId,
        championshipName: champ?.name,
        teamId: myTeam.id,
        teamName: myTeam.name,
        matchId: nextMatch.id,
      }));
    }
  }

  // Partidas canceladas (com meu time)
  const cancelledMatches = teamMatches.filter((m) => m.status === 'cancelado');
  for (const m of cancelledMatches.slice(0, 3)) {
    items.push(makeItem({
      id: pendingId('captain_match_cancelled', m.id),
      role: 'capitao',
      type: 'captain_match_cancelled',
      category: 'matches',
      severity: 'low',
      title: `Partida cancelada`,
      description: `A partida da rodada ${m.round} foi cancelada pelo organizador.`,
      destination: { type: 'match_fixtures' },
      championshipId: m.championshipId,
      championshipName: champ?.name,
      teamId: myTeam.id,
      teamName: myTeam.name,
      matchId: m.id,
    }));
  }

  // Classificação / eliminação / próxima eliminatória (informativo)
  items.push(
    ...deriveTeamKnockoutItems({
      role: 'capitao',
      championship: champ,
      team: myTeam,
      matches: teamMatches,
      ownerId: myTeam.id,
    }),
  );

  return items;
}

// ── PARTE 4 — Derivação do Atleta ─────────────────────────────────────────────

export interface AthletePendingInput {
  user: AppUser;
  championships: Championship[];
  teams: Team[];
  players: Player[];
  matches: MatchModel[];
  convocations: Convocation[];
  attendances: MatchAttendance[];
  activeChampionshipId?: string | null;
  now?: Date;
}

export function deriveAthletePendingItems(input: AthletePendingInput): PendingItem[] {
  const {
    user,
    championships,
    teams,
    players,
    matches,
    convocations,
    attendances,
    activeChampionshipId,
    now = new Date(),
  } = input;

  // Atleta: procura o player ativo vinculado a este userId
  const myPlayer = players.find(
    (p) =>
      p.userId === user.id &&
      isActiveRosterPlayer(p) &&
      (!activeChampionshipId || p.championshipId === activeChampionshipId),
  );

  const items: PendingItem[] = [];

  // Sem time
  if (!myPlayer) {
    items.push(makeItem({
      id: pendingId('athlete_no_team', user.id),
      role: 'atleta',
      type: 'athlete_no_team',
      category: 'teams',
      severity: 'info',
      title: `Você não está em nenhum time`,
      description: `Use o código de convite do seu capitão para entrar em um time.`,
    }));
    return items;
  }

  const myTeam = teams.find((t) => t.id === myPlayer.teamId);
  const champ = championships.find((c) => c.id === myPlayer.championshipId);
  const teamMatches = matches.filter(
    (m) =>
      m.championshipId === myPlayer.championshipId &&
      (m.homeTeamId === myPlayer.teamId || m.awayTeamId === myPlayer.teamId),
  );
  const upcomingMatches = teamMatches
    .filter((m) => m.status === 'agendado' || m.status === 'adiado')
    .sort((a, b) => {
      if (a.scheduledAt && b.scheduledAt) {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
      return 0;
    });
  const nextMatch = upcomingMatches[0];

  // Suspensão ativa
  if (myPlayer.status === 'suspenso') {
    items.push(makeItem({
      id: pendingId('athlete_suspension_active', myPlayer.id),
      role: 'atleta',
      type: 'athlete_suspension_active',
      category: 'roster',
      severity: 'high',
      title: `Você está suspenso`,
      description: `Você está suspenso${myPlayer.suspendedRound ? ` para a rodada ${myPlayer.suspendedRound}` : ''} e não pode ser convocado.`,
      championshipId: myPlayer.championshipId,
      championshipName: champ?.name,
      teamId: myPlayer.teamId ?? undefined,
      teamName: myTeam?.name,
      playerId: myPlayer.id,
    }));
  }

  // Próxima partida: convocação e presença
  if (nextMatch) {
    const conv = convocations.find(
      (c) => c.matchId === nextMatch.id && c.teamId === myPlayer.teamId,
    );
    const isConvoked = conv?.playerIds.includes(myPlayer.id);
    const myAttendance = isConvoked
      ? attendances.find((a) => a.matchId === nextMatch.id && a.playerId === myPlayer.id)
      : undefined;

    if (isConvoked) {
      // Reconfirmação necessária
      if (myAttendance?.reconfirmationRequired || conv?.requiresReconfirmation) {
        items.push(makeItem({
          id: pendingId('athlete_attendance_reconfirmation', nextMatch.id, myPlayer.id),
          role: 'atleta',
          type: 'athlete_attendance_reconfirmation',
          category: 'attendance',
          severity: 'critical',
          title: `Reconfirme sua presença`,
          description: `A partida da rodada ${nextMatch.round} foi adiada. Confirme se você pode jogar na nova data.`,
          actionLabel: 'Reconfirmar',
          dueAt: nextMatch.scheduledAt ?? undefined,
          destination: { type: 'match_prematch', matchId: nextMatch.id },
          championshipId: nextMatch.championshipId,
          championshipName: champ?.name,
          teamId: myPlayer.teamId ?? undefined,
          teamName: myTeam?.name,
          matchId: nextMatch.id,
          playerId: myPlayer.id,
        }));
      } else if (!myAttendance || myAttendance.response === 'pending') {
        // Resposta pendente
        const tag = deadlineTag(nextMatch.scheduledAt, now);
        const sev: PendingItemSeverity =
          tag === 'overdue' || tag === 'today' || tag === 'within_24h' ? 'critical' : 'high';
        items.push(makeItem({
          id: pendingId('athlete_attendance_pending', nextMatch.id, myPlayer.id),
          role: 'atleta',
          type: 'athlete_attendance_pending',
          category: 'attendance',
          severity: sev,
          title: `Confirme sua presença`,
          description: `Você foi convocado para a rodada ${nextMatch.round}. Responda se poderá jogar.${groupContextSuffix(nextMatch, champ)}`,
          actionLabel: 'Confirmar presença',
          dueAt: nextMatch.scheduledAt ?? undefined,
          destination: { type: 'match_prematch', matchId: nextMatch.id },
          championshipId: nextMatch.championshipId,
          championshipName: champ?.name,
          teamId: myPlayer.teamId ?? undefined,
          teamName: myTeam?.name,
          matchId: nextMatch.id,
          playerId: myPlayer.id,
        }));
      }
    }

    // Partida adiada
    if (nextMatch.status === 'adiado') {
      items.push(makeItem({
        id: pendingId('athlete_match_postponed', nextMatch.id),
        role: 'atleta',
        type: 'athlete_match_postponed',
        category: 'matches',
        severity: 'medium',
        title: `Partida adiada`,
        description: `A partida da rodada ${nextMatch.round} foi adiada. Aguarde nova data do seu capitão.`,
        destination: { type: 'match_fixtures' },
        championshipId: nextMatch.championshipId,
        championshipName: champ?.name,
        teamId: myPlayer.teamId ?? undefined,
        teamName: myTeam?.name,
        matchId: nextMatch.id,
      }));
    }
  }

  // Partidas canceladas recentes
  const recentCancelled = teamMatches.filter((m) => m.status === 'cancelado').slice(0, 3);
  for (const m of recentCancelled) {
    items.push(makeItem({
      id: pendingId('athlete_match_cancelled', m.id),
      role: 'atleta',
      type: 'athlete_match_cancelled',
      category: 'matches',
      severity: 'info',
      title: `Partida cancelada`,
      description: `A partida da rodada ${m.round} foi cancelada.`,
      destination: { type: 'match_fixtures' },
      championshipId: m.championshipId,
      championshipName: champ?.name,
      teamId: myPlayer.teamId ?? undefined,
      teamName: myTeam?.name,
      matchId: m.id,
    }));
  }

  // Classificação / eliminação / próxima eliminatória (informativo)
  if (myTeam) {
    items.push(
      ...deriveTeamKnockoutItems({
        role: 'atleta',
        championship: champ,
        team: myTeam,
        matches: teamMatches,
        ownerId: myPlayer.id,
      }),
    );
  }

  return items;
}

// ── Navegação: mapper de PendingDestination para parâmetros de rota ───────────

/**
 * Converte um PendingDestination em parâmetros usáveis pelos navigators existentes.
 * Retorna null se o destino não tiver rota mapeada.
 */
export function resolvePendingDestination(dest: PendingDestination, role?: UserRole): {
  stack: 'home' | 'fixtures' | 'captain';
  screen: string;
  params?: Record<string, unknown>;
} | null {
  switch (dest.type) {
    case 'championship_manage':
      if (role && role !== 'organizador') return null;
      if (!dest.championshipId) return null;
      return { stack: 'home', screen: 'ChampionshipDashboard', params: { championshipId: dest.championshipId } };
    case 'championship_dashboard':
      if (!dest.championshipId) return null;
      return { stack: 'home', screen: 'ChampionshipDashboard', params: { championshipId: dest.championshipId } };
    case 'match_prematch':
      if (!dest.matchId) return null;
      return { stack: 'fixtures', screen: 'PreMatch', params: { matchId: dest.matchId } };
    case 'match_registration':
      if (!dest.matchId) return null;
      return { stack: 'fixtures', screen: 'MatchRegistration', params: { matchId: dest.matchId } };
    case 'match_fixtures':
      return { stack: 'fixtures', screen: 'FixturesMain' };
    case 'roster_manage':
      if (role && role !== 'capitao') return null;
      if (!dest.teamId) return null;
      return { stack: 'captain', screen: 'ManageRoster', params: { teamId: dest.teamId } };
    case 'join_requests_dashboard':
      if (role && role !== 'capitao') return null;
      return { stack: 'captain', screen: 'CaptainDashboard' };
    case 'notification_center':
      return { stack: 'home', screen: 'NotificationCenter' };
    case 'round_voting':
      if (!dest.championshipId || typeof dest.round !== 'number') return null;
      return {
        stack: 'fixtures',
        screen: 'Voting',
        params: { championshipId: dest.championshipId, round: dest.round },
      };
    case 'groups_overview':
      if (!dest.championshipId) return null;
      return { stack: 'fixtures', screen: 'GroupsOverview', params: { championshipId: dest.championshipId } };
    case 'group_fixtures':
      if (!dest.championshipId) return null;
      return {
        stack: 'fixtures',
        screen: 'GroupFixtures',
        params: dest.groupId
          ? { championshipId: dest.championshipId, groupId: dest.groupId }
          : { championshipId: dest.championshipId },
      };
    case 'group_stage_review':
      // A revisão da fase de grupos é uma ação exclusiva do organizador.
      if (role && role !== 'organizador') return null;
      if (!dest.championshipId) return null;
      return { stack: 'fixtures', screen: 'GroupStageReview', params: { championshipId: dest.championshipId } };
    case 'knockout_bracket':
      // Não existe rota dedicada de chave: o bracket é exibido na tela de fixtures.
      if (!dest.championshipId) return null;
      return { stack: 'fixtures', screen: 'FixturesMain' };
    default:
      return null;
  }
}
