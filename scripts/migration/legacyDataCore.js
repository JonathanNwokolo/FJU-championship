const MIGRATION_VERSION = 'block-6-legacy-data-v1';

const ACTIVE_ROSTER_STATUSES = new Set(['ativo', 'suspenso', 'lesionado']);
const INACTIVE_ROSTER_STATUSES = new Set(['sem_time', 'removido']);
const CONVOCATION_OPEN_MATCH_STATUSES = new Set(['agendado', 'adiado']);
const MATCH_STATUSES = new Set(['agendado', 'ao_vivo', 'finalizado', 'adiado', 'cancelado', 'wo']);

const COLLECTIONS = [
  'users',
  'championships',
  'teams',
  'players',
  'team_memberships',
  'matches',
  'match_events',
  'match_convocations',
  'match_attendance',
  'round_awards',
  'championship_results',
  'career_stats',
  'player_history',
  'all_time_rankings',
  'organizer_allowlist',
  'match_status_changes',
  'match_corrections',
  'achievements',
  // Bloco 10.5 — coleções estruturais do formato grupos + mata-mata.
  'group_assignment_logs',
  'group_fixture_logs',
  'group_stage_snapshots',
  'group_transition_logs',
];

const GROUPS_FORMAT = 'grupos_e_mata_mata';
const KNOWN_GROUP_STAGE_STATUSES = new Set([
  'not_generated',
  'groups_generated',
  'fixtures_generated',
  'in_progress',
  'ready_to_complete',
  'completed',
]);
const KNOWN_KNOCKOUT_STAGE_STATUSES = new Set(['not_generated', 'generated']);
const KNOWN_CHAMPIONSHIP_STAGES = new Set([
  'registration',
  'league',
  'group_stage',
  'group_stage_completed',
  'knockout',
  'completed',
]);

const DEFAULT_DATASET = COLLECTIONS.reduce((acc, name) => ({ ...acc, [name]: [] }), {
  legacyConvocations: [],
});

function normalizeDataset(input) {
  const dataset = { ...DEFAULT_DATASET, ...(input || {}) };
  for (const key of Object.keys(DEFAULT_DATASET)) {
    dataset[key] = Array.isArray(dataset[key]) ? dataset[key] : [];
  }
  return dataset;
}

function byId(list) {
  return new Map(list.map((item) => [item.id, item]));
}

function docPath(collection, id) {
  return `${collection}/${id}`;
}

function membershipId(teamId, userId) {
  return `${teamId}_${userId}`;
}

function convocationId(matchId, teamId) {
  return `${matchId}_${teamId}`;
}

function attendanceId(matchId, playerId) {
  return `${matchId}_${playerId}`;
}

function awardId(championshipId, round) {
  return `${championshipId}_${round}`;
}

// ── Helpers do formato grupos + mata-mata (Bloco 10.5) ───────────────────────

function isGroupsFormat(championship) {
  return !!championship && championship.format === GROUPS_FORMAT;
}

/** Normaliza um groupId para 'A'/'B'; aceita o literal ou o id determinístico `..._group_A`. */
function normalizeGroupLabel(groupId) {
  if (groupId == null) return null;
  const raw = String(groupId).trim();
  if (raw === 'A' || raw === 'B') return raw;
  const match = /_group_([AB])$/i.exec(raw) || /_([AB])$/.exec(raw);
  return match ? match[1].toUpperCase() : null;
}

function hasGeneratedGroupsFlag(championship) {
  if (!championship) return false;
  const status = championship.groupStageStatus;
  return (
    status === 'groups_generated' ||
    status === 'fixtures_generated' ||
    status === 'in_progress' ||
    status === 'ready_to_complete' ||
    status === 'completed' ||
    (typeof championship.groupGenerationVersion === 'number' && championship.groupGenerationVersion > 0)
  );
}

function hasGeneratedFixturesFlag(championship) {
  return !!championship && (championship.groupFixturesVersion ?? 0) >= 1;
}

function hasGeneratedKnockoutFlag(championship) {
  if (!championship) return false;
  return (
    championship.knockoutStageStatus === 'generated' ||
    (typeof championship.knockoutGenerationVersion === 'number' && championship.knockoutGenerationVersion > 0)
  );
}

function expectedGroupFixtureCount(n) {
  return n > 1 ? (n * (n - 1)) / 2 : 0;
}

function isApprovedActiveTeam(team) {
  return !!team && (team.status === 'aprovado' || team.status == null);
}

function isRosterSlotPlayer(player) {
  if (!player || !player.teamId) return false;
  if (player.status == null) return true;
  return ACTIVE_ROSTER_STATUSES.has(player.status);
}

function isInactiveRosterPlayer(player) {
  return !!player && INACTIVE_ROSTER_STATUSES.has(player.status);
}

function isActiveMembership(membership) {
  if (!membership) return false;
  if (membership.active === false) return false;
  if (membership.status == null) return true;
  return !INACTIVE_ROSTER_STATUSES.has(membership.status);
}

function teamOccupiesRegistrationSlot(team) {
  return !!team && team.status !== 'rejeitado';
}

function sanitizeForReport(value) {
  if (Array.isArray(value)) return value.map(sanitizeForReport);
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && value.includes('@')) return maskEmail(value);
    return value;
  }
  const output = {};
  for (const [key, inner] of Object.entries(value)) {
    if (/email/i.test(key) && typeof inner === 'string') {
      output[key] = maskEmail(inner);
    } else {
      output[key] = sanitizeForReport(inner);
    }
  }
  return output;
}

function maskEmail(email) {
  const [name, domain] = email.split('@');
  if (!domain) return email;
  const prefix = name.length <= 2 ? `${name[0] || '*'}*` : `${name.slice(0, 2)}***`;
  return `${prefix}@${domain}`;
}

function makeIssue(category, severity, documentPath, message, extra = {}) {
  return {
    category,
    severity,
    documentPath,
    message,
    autoFixable: false,
    suggestedRepair: 'Revisar manualmente antes de aplicar qualquer alteração.',
    conflicts: [],
    ...extra,
    details: sanitizeForReport(extra.details || {}),
  };
}

function collectIssues(report, category, issues) {
  report.categories[category] = {
    total: issues.length,
    issues,
    autoFixable: issues.filter((issue) => issue.autoFixable).length,
    manualReview: issues.filter((issue) => !issue.autoFixable).length,
  };
  report.issues.push(...issues);
}

function groupBy(list, getKey) {
  const map = new Map();
  for (const item of list) {
    const key = getKey(item);
    if (!key) continue;
    map.set(key, [...(map.get(key) || []), item]);
  }
  return map;
}

function findStructuralPlayerConflicts(dataset) {
  const players = dataset.players;
  const activeByChampUser = groupBy(
    players.filter((player) => isRosterSlotPlayer(player) && player.userId && player.championshipId),
    (player) => `${player.championshipId}_${player.userId}`,
  );
  const activeByTeamNumber = groupBy(
    players.filter((player) => isRosterSlotPlayer(player) && player.teamId && player.number != null),
    (player) => `${player.teamId}_${player.number}`,
  );
  return {
    multiTeamByChampUser: new Map(
      [...activeByChampUser.entries()].filter(([, list]) => new Set(list.map((p) => p.teamId)).size > 1),
    ),
    duplicateNumberByTeam: new Map(
      [...activeByTeamNumber.entries()].filter(([, list]) => list.length > 1),
    ),
  };
}

function createBaseReport(dataset, options = {}) {
  const collectionCounts = {};
  for (const key of Object.keys(DEFAULT_DATASET)) {
    collectionCounts[key] = dataset[key].length;
  }
  return {
    migrationVersion: MIGRATION_VERSION,
    generatedAt: options.generatedAt || new Date().toISOString(),
    projectId: options.projectId || 'unknown',
    environment: options.environment || 'unknown',
    mode: options.apply ? 'apply' : 'dry-run',
    collectionsAnalyzed: Object.keys(collectionCounts),
    totalDocuments: Object.values(collectionCounts).reduce((sum, count) => sum + count, 0),
    collectionCounts,
    categories: {},
    issues: [],
    proposedChanges: [],
    summary: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
      autoFixable: 0,
      manualReview: 0,
    },
  };
}

function finalizeReport(report) {
  for (const issue of report.issues) {
    const key = issue.severity.toLowerCase();
    report.summary[key] = (report.summary[key] || 0) + 1;
    if (issue.autoFixable) report.summary.autoFixable += 1;
    else report.summary.manualReview += 1;
  }
  report.summary.totalIssues = report.issues.length;
  report.summary.totalProposedChanges = report.proposedChanges.length;
  return report;
}

function auditTeamMemberships(dataset) {
  const teams = byId(dataset.teams);
  const users = byId(dataset.users);
  const players = byId(dataset.players);
  const championships = byId(dataset.championships);
  const memberships = byId(dataset.team_memberships);
  const issues = [];

  for (const player of dataset.players) {
    if (!isRosterSlotPlayer(player) || !player.userId || !player.teamId || !player.championshipId) continue;
    const team = teams.get(player.teamId);
    const user = users.get(player.userId);
    const championship = championships.get(player.championshipId);
    const expectedId = membershipId(player.teamId, player.userId);
    const existing = memberships.get(expectedId);
    if (!existing && user && team && championship && team.championshipId === player.championshipId) {
      issues.push(makeIssue(
        'team-memberships',
        'HIGH',
        docPath('players', player.id),
        `Player ativo sem team_memberships/${expectedId}.`,
        {
          autoFixable: true,
          suggestedRepair: `Criar team_memberships/${expectedId} com ID deterministico.`,
          details: { playerId: player.id, teamId: player.teamId, userId: player.userId },
        },
      ));
    } else if (!existing) {
      issues.push(makeIssue(
        'team-memberships',
        'CRITICAL',
        docPath('players', player.id),
        'Player ativo sem membership, mas faltam documentos relacionados para backfill seguro.',
        { details: { userExists: !!user, teamExists: !!team, championshipExists: !!championship } },
      ));
    }
  }

  for (const membership of dataset.team_memberships) {
    const team = teams.get(membership.teamId);
    const player = players.get(membership.playerId);
    const user = users.get(membership.userId);
    const championship = championships.get(membership.championshipId);
    const conflicts = [];
    if (!membership.teamId || !membership.userId || membership.id !== membershipId(membership.teamId, membership.userId)) {
      conflicts.push('id_deterministico_invalido');
    }
    if (!team) conflicts.push('team_inexistente');
    if (!player) conflicts.push('player_inexistente');
    if (!user) conflicts.push('user_inexistente');
    if (!championship) conflicts.push('championship_inexistente');
    if (team && membership.championshipId !== team.championshipId) conflicts.push('championship_diferente_do_time');
    if (player && isInactiveRosterPlayer(player) && isActiveMembership(membership)) {
      conflicts.push('membership_ativo_para_player_inativo');
    }
    if (
      player &&
      (player.teamId !== membership.teamId ||
        player.userId !== membership.userId ||
        player.championshipId !== membership.championshipId)
    ) {
      conflicts.push('membership_incompativel_com_player');
    }
    if (conflicts.length > 0) {
      issues.push(makeIssue(
        'team-memberships',
        conflicts.includes('user_inexistente') || conflicts.includes('player_inexistente') ? 'CRITICAL' : 'HIGH',
        docPath('team_memberships', membership.id),
        'Membership inconsistente com documentos fonte.',
        { conflicts, details: { membershipId: membership.id } },
      ));
    }
  }

  const activeMembershipsByChampUser = groupBy(
    dataset.team_memberships.filter((item) => isActiveMembership(item)),
    (item) => (item.championshipId && item.userId ? `${item.championshipId}_${item.userId}` : null),
  );
  for (const [key, list] of activeMembershipsByChampUser.entries()) {
    if (new Set(list.map((item) => item.teamId)).size <= 1) continue;
    issues.push(makeIssue(
      'team-memberships',
      'CRITICAL',
      `team_memberships/*`,
      'Usuario com multiplos memberships ativos no mesmo campeonato.',
      { conflicts: ['multiplos_memberships_ativos'], details: { key, membershipIds: list.map((item) => item.id) } },
    ));
  }

  return issues;
}

function auditApprovedPlayerCounts(dataset) {
  const issues = [];
  const conflicts = findStructuralPlayerConflicts(dataset);
  for (const team of dataset.teams) {
    const roster = dataset.players.filter((player) => player.teamId === team.id);
    const realCount = roster.filter(isRosterSlotPlayer).length;
    const maxPlayers = team.maxPlayers == null ? 15 : team.maxPlayers;
    const hasDuplicateNumber = [...conflicts.duplicateNumberByTeam.keys()].some((key) => key.startsWith(`${team.id}_`));
    const hasMultiTeamPlayer = roster.some((player) => {
      if (!player.userId || !player.championshipId) return false;
      return conflicts.multiTeamByChampUser.has(`${player.championshipId}_${player.userId}`);
    });
    const structuralConflict = hasDuplicateNumber || hasMultiTeamPlayer;
    if (team.approvedPlayersCount == null) {
      issues.push(makeIssue(
        'approved-player-counts',
        'MEDIUM',
        docPath('teams', team.id),
        'approvedPlayersCount ausente.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Recalcular para ${realCount}.`,
          details: { realCount, current: null },
        },
      ));
    } else if (team.approvedPlayersCount < 0) {
      issues.push(makeIssue(
        'approved-player-counts',
        'HIGH',
        docPath('teams', team.id),
        'approvedPlayersCount negativo.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Recalcular para ${realCount}.`,
          details: { realCount, current: team.approvedPlayersCount },
        },
      ));
    } else if (team.approvedPlayersCount > maxPlayers) {
      issues.push(makeIssue(
        'approved-player-counts',
        'HIGH',
        docPath('teams', team.id),
        'approvedPlayersCount maior que maxPlayers.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Recalcular para ${realCount}.`,
          details: { realCount, current: team.approvedPlayersCount, maxPlayers },
        },
      ));
    } else if (team.approvedPlayersCount !== realCount) {
      issues.push(makeIssue(
        'approved-player-counts',
        'MEDIUM',
        docPath('teams', team.id),
        'approvedPlayersCount divergente do elenco real.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Atualizar approvedPlayersCount para ${realCount}.`,
          conflicts: structuralConflict ? ['conflito_estrutural_no_elenco'] : [],
          details: { realCount, current: team.approvedPlayersCount },
        },
      ));
    }
  }
  for (const [key, list] of conflicts.multiTeamByChampUser.entries()) {
    issues.push(makeIssue(
      'approved-player-counts',
      'CRITICAL',
      'players/*',
      'Player/user ocupa vaga em dois times no mesmo campeonato.',
      { conflicts: ['player_em_dois_times'], details: { key, playerIds: list.map((item) => item.id) } },
    ));
  }
  for (const [key, list] of conflicts.duplicateNumberByTeam.entries()) {
    issues.push(makeIssue(
      'approved-player-counts',
      'HIGH',
      'players/*',
      'Numero de camisa duplicado dentro do elenco ativo.',
      { conflicts: ['numero_duplicado'], details: { key, playerIds: list.map((item) => item.id) } },
    ));
  }
  return issues;
}

function auditRegisteredTeamCounts(dataset) {
  const issues = [];
  const teamsByChamp = groupBy(dataset.teams, (team) => team.championshipId);
  const captainByChamp = groupBy(
    dataset.teams.filter((team) => team.captainId && teamOccupiesRegistrationSlot(team)),
    (team) => `${team.championshipId}_${team.captainId}`,
  );
  const captainConflictChampIds = new Set(
    [...captainByChamp.values()]
      .filter((list) => list.length > 1)
      .flatMap((list) => list.map((team) => team.championshipId)),
  );
  for (const championship of dataset.championships) {
    const teams = teamsByChamp.get(championship.id) || [];
    const realCount = teams.filter(teamOccupiesRegistrationSlot).length;
    const maxTeams = championship.maxTeams == null ? null : championship.maxTeams;
    const structuralConflict = captainConflictChampIds.has(championship.id);
    if (championship.registeredTeamsCount == null) {
      issues.push(makeIssue(
        'registered-team-counts',
        'MEDIUM',
        docPath('championships', championship.id),
        'registeredTeamsCount ausente.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Recalcular para ${realCount} usando status != rejeitado.`,
          details: { realCount, current: null, countingRule: 'teams.status !== rejeitado' },
        },
      ));
    } else if (championship.registeredTeamsCount < 0) {
      issues.push(makeIssue(
        'registered-team-counts',
        'HIGH',
        docPath('championships', championship.id),
        'registeredTeamsCount negativo.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Recalcular para ${realCount}.`,
          details: { realCount, current: championship.registeredTeamsCount },
        },
      ));
    } else if (maxTeams != null && championship.registeredTeamsCount > maxTeams) {
      issues.push(makeIssue(
        'registered-team-counts',
        'HIGH',
        docPath('championships', championship.id),
        'registeredTeamsCount maior que maxTeams.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Recalcular para ${realCount}.`,
          details: { realCount, current: championship.registeredTeamsCount, maxTeams },
        },
      ));
    } else if (championship.registeredTeamsCount !== realCount) {
      issues.push(makeIssue(
        'registered-team-counts',
        'MEDIUM',
        docPath('championships', championship.id),
        'registeredTeamsCount divergente da regra atual.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Atualizar registeredTeamsCount para ${realCount}.`,
          conflicts: structuralConflict ? ['capitao_duplicado_no_campeonato'] : [],
          details: {
            realCount,
            current: championship.registeredTeamsCount,
            countingRule: 'times com status diferente de rejeitado',
          },
        },
      ));
    }
    if (maxTeams != null && championship.registeredTeamsCount >= maxTeams && realCount < maxTeams) {
      issues.push(makeIssue(
        'registered-team-counts',
        'HIGH',
        docPath('championships', championship.id),
        'Campeonato parece lotado pelo contador, mas ha vaga real.',
        {
          autoFixable: !structuralConflict,
          suggestedRepair: `Atualizar registeredTeamsCount para ${realCount}.`,
          conflicts: structuralConflict ? ['capitao_duplicado_no_campeonato'] : [],
          details: { realCount, current: championship.registeredTeamsCount, maxTeams },
        },
      ));
    }
  }

  for (const team of dataset.teams) {
    if (!team.championshipId || !dataset.championships.some((champ) => champ.id === team.championshipId)) {
      issues.push(makeIssue(
        'registered-team-counts',
        'HIGH',
        docPath('teams', team.id),
        'Time sem campeonato valido.',
        { conflicts: ['time_orfao'] },
      ));
    }
  }

  return issues;
}

function auditOrphanPlayers(dataset) {
  const teams = byId(dataset.teams);
  const users = byId(dataset.users);
  const championships = byId(dataset.championships);
  const memberships = byId(dataset.team_memberships);
  const issues = [];
  const playersByChampUser = groupBy(
    dataset.players.filter((player) => player.userId && player.championshipId),
    (player) => `${player.championshipId}_${player.userId}`,
  );
  for (const player of dataset.players) {
    const conflicts = [];
    if (player.teamId && !teams.has(player.teamId)) conflicts.push('team_inexistente');
    if (player.championshipId && !championships.has(player.championshipId)) conflicts.push('championship_inexistente');
    if (player.userId && !users.has(player.userId) && !player.guestPlayer) conflicts.push('user_inexistente');
    if (isRosterSlotPlayer(player) && !player.teamId) conflicts.push('ativo_sem_time');
    if (isInactiveRosterPlayer(player)) {
      const team = player.teamId ? teams.get(player.teamId) : null;
      if (team && team.approvedPlayersCount != null) {
        conflicts.push('player_removido_deve_ser_ignorado_em_contador');
      }
    }
    if (!player.name || !player.position || player.number == null) conflicts.push('dados_minimos_ausentes');
    if (player.teamId && player.userId && !memberships.has(membershipId(player.teamId, player.userId)) && isRosterSlotPlayer(player)) {
      conflicts.push('membership_ausente');
    }
    if (conflicts.length) {
      issues.push(makeIssue(
        'orphan-players',
        conflicts.some((item) => item.includes('inexistente')) ? 'HIGH' : 'MEDIUM',
        docPath('players', player.id),
        'Player com inconsistencias estruturais.',
        {
          conflicts,
          suggestedRepair: conflicts.length === 1 && conflicts[0] === 'membership_ausente'
            ? 'Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.'
            : 'Revisao manual obrigatoria.',
          details: { playerId: player.id, userId: player.userId, teamId: player.teamId },
        },
      ));
    }
  }
  for (const [key, list] of playersByChampUser.entries()) {
    const activeTeams = new Set(list.filter(isRosterSlotPlayer).map((player) => player.teamId).filter(Boolean));
    if (activeTeams.size > 1) {
      issues.push(makeIssue(
        'orphan-players',
        'CRITICAL',
        'players/*',
        'Mesmo userId ativo em dois times no mesmo campeonato.',
        { conflicts: ['player_em_dois_times'], details: { key, playerIds: list.map((item) => item.id) } },
      ));
    }
  }
  return issues;
}

function auditCaptains(dataset) {
  const users = byId(dataset.users);
  const playersByUserTeam = groupBy(
    dataset.players.filter((player) => player.userId && player.teamId),
    (player) => `${player.userId}_${player.teamId}`,
  );
  const memberships = byId(dataset.team_memberships);
  const issues = [];
  const captainByChamp = groupBy(
    dataset.teams.filter((team) => team.captainId),
    (team) => `${team.championshipId}_${team.captainId}`,
  );

  for (const team of dataset.teams) {
    const conflicts = [];
    if (!team.captainId) conflicts.push('captainId_vazio');
    if (team.captainId && !users.has(team.captainId)) conflicts.push('captain_user_inexistente');
    const playerList = playersByUserTeam.get(`${team.captainId}_${team.id}`) || [];
    const activePlayer = playerList.find(isRosterSlotPlayer);
    if (team.captainId && !activePlayer) conflicts.push('capitao_fora_do_time');
    const membership = team.captainId ? memberships.get(membershipId(team.id, team.captainId)) : null;
    if (team.captainId && (!membership || !isActiveMembership(membership))) conflicts.push('capitao_sem_membership_ativo');
    if (team.status === 'aprovado' && conflicts.length) conflicts.push('time_aprovado_sem_capitao_valido');
    if (conflicts.length) {
      issues.push(makeIssue(
        'captains',
        team.status === 'aprovado' ? 'CRITICAL' : 'HIGH',
        docPath('teams', team.id),
        'Time sem capitao valido.',
        { conflicts, suggestedRepair: 'Corrigir capitao manualmente; nao atribuir automaticamente.' },
      ));
    }
  }
  for (const [key, list] of captainByChamp.entries()) {
    if (list.length <= 1) continue;
    issues.push(makeIssue(
      'captains',
      'CRITICAL',
      'teams/*',
      'Mesmo capitao em dois times no mesmo campeonato.',
      { conflicts: ['capitao_duplicado'], details: { key, teamIds: list.map((team) => team.id) } },
    ));
  }
  return issues;
}

function auditLegacyConvocations(dataset) {
  const teams = byId(dataset.teams);
  const players = byId(dataset.players);
  const current = byId(dataset.match_convocations);
  const issues = [];
  for (const legacy of dataset.legacyConvocations) {
    const teamId = legacy.teamId;
    const team = teams.get(teamId);
    const round = Number(legacy.round || legacy.id);
    if (!team) {
      issues.push(makeIssue('legacy-convocations', 'HIGH', legacy.path || `teams/${teamId}/convocations/${legacy.id}`, 'Convocacao legada aponta para time inexistente.', { conflicts: ['time_inexistente'] }));
      continue;
    }
    const matches = dataset.matches.filter(
      (match) =>
        match.championshipId === team.championshipId &&
        Number(match.round) === round &&
        (match.homeTeamId === teamId || match.awayTeamId === teamId),
    );
    const invalidPlayerIds = (legacy.playerIds || []).filter((playerId) => {
      const player = players.get(playerId);
      return !player || player.teamId !== teamId || !isRosterSlotPlayer(player);
    });
    const path = legacy.path || `teams/${teamId}/convocations/${legacy.id}`;
    if (matches.length === 0) {
      issues.push(makeIssue('legacy-convocations', 'HIGH', path, 'Convocacao legada sem partida compativel.', { conflicts: ['partida_inexistente'] }));
    } else if (matches.length > 1) {
      issues.push(makeIssue('legacy-convocations', 'HIGH', path, 'Convocacao legada ambigua: ha varias partidas na mesma rodada.', { conflicts: ['convocacao_ambigua'], details: { matchIds: matches.map((match) => match.id) } }));
    } else if (invalidPlayerIds.length > 0) {
      issues.push(makeIssue('legacy-convocations', 'HIGH', path, 'Convocacao legada possui jogadores invalidos.', { conflicts: ['jogadores_invalidos'], details: { invalidPlayerIds } }));
    } else if (current.has(convocationId(matches[0].id, teamId))) {
      issues.push(makeIssue('legacy-convocations', 'MEDIUM', path, 'Convocacao atual ja existe para a partida.', { conflicts: ['convocacao_duplicada'] }));
    } else {
      issues.push(makeIssue(
        'legacy-convocations',
        'INFO',
        path,
        'Convocacao legada migravel para match_convocations.',
        {
          autoFixable: true,
          suggestedRepair: `Criar match_convocations/${convocationId(matches[0].id, teamId)} preservando legacySourcePath.`,
          details: { matchId: matches[0].id, teamId, round },
        },
      ));
    }
  }
  return issues;
}

function auditCurrentConvocationsAndAttendance(dataset) {
  const matches = byId(dataset.matches);
  const teams = byId(dataset.teams);
  const players = byId(dataset.players);
  const users = byId(dataset.users);
  const issues = [];

  for (const conv of dataset.match_convocations) {
    const match = matches.get(conv.matchId);
    const team = teams.get(conv.teamId);
    const conflicts = [];
    if (conv.id !== convocationId(conv.matchId, conv.teamId)) conflicts.push('id_invalido');
    if (!match) conflicts.push('match_inexistente');
    if (!team) conflicts.push('team_inexistente');
    if (match && conv.championshipId !== match.championshipId) conflicts.push('championship_diferente_da_partida');
    if (team && conv.championshipId !== team.championshipId) conflicts.push('championship_diferente_do_time');
    if (team && conv.captainId !== team.captainId) conflicts.push('captainId_invalido');
    for (const playerId of conv.playerIds || []) {
      const player = players.get(playerId);
      if (!player || player.teamId !== conv.teamId || !isRosterSlotPlayer(player)) conflicts.push(`player_invalido:${playerId}`);
    }
    if (match && !CONVOCATION_OPEN_MATCH_STATUSES.has(match.status) && conv.status === 'open') {
      conflicts.push('convocacao_operacionalmente_aberta_em_partida_fechada');
    }
    if (match && match.status === 'adiado' && conv.requiresReconfirmation !== true) {
      conflicts.push('reconfirmacao_ausente_em_partida_adiada');
    }
    if (conv.version == null || conv.version < 1) conflicts.push('version_invalida');
    if (conflicts.length) {
      issues.push(makeIssue('current-convocations-attendance', 'HIGH', docPath('match_convocations', conv.id), 'match_convocations inconsistente.', { conflicts }));
    }
  }

  for (const att of dataset.match_attendance) {
    const match = matches.get(att.matchId);
    const player = players.get(att.playerId);
    const user = att.userId ? users.get(att.userId) : null;
    const conv = dataset.match_convocations.find((item) => item.id === convocationId(att.matchId, att.teamId));
    const conflicts = [];
    if (att.id !== attendanceId(att.matchId, att.playerId)) conflicts.push('id_invalido');
    if (!match) conflicts.push('match_inexistente');
    if (!player) conflicts.push('player_inexistente');
    if (att.userId && !user) conflicts.push('user_inexistente');
    if (player && player.userId !== att.userId) conflicts.push('userId_diferente_do_player');
    if (player && player.teamId !== att.teamId) conflicts.push('teamId_diferente_do_player');
    if (!conv || !(conv.playerIds || []).includes(att.playerId)) conflicts.push('jogador_nao_convocado');
    if (att.response && !['pending', 'confirmed', 'declined'].includes(att.response)) conflicts.push('response_invalido');
    if (att.version == null || att.version < 1) conflicts.push('version_invalida');
    if (match && !CONVOCATION_OPEN_MATCH_STATUSES.has(match.status) && att.response !== 'pending') {
      conflicts.push('presenca_ativa_em_partida_fechada');
    }
    if (conflicts.length) {
      issues.push(makeIssue('current-convocations-attendance', 'HIGH', docPath('match_attendance', att.id), 'match_attendance inconsistente.', { conflicts }));
    }
  }
  return issues;
}

function auditMatches(dataset) {
  const teams = byId(dataset.teams);
  const championships = byId(dataset.championships);
  const matches = byId(dataset.matches);
  const eventsByMatch = groupBy(dataset.match_events, (event) => event.matchId);
  const statusChanges = byId(dataset.match_status_changes);
  const corrections = byId(dataset.match_corrections);
  const issues = [];

  for (const match of dataset.matches) {
    const conflicts = [];
    if (!match.championshipId || !championships.has(match.championshipId)) conflicts.push('championship_inexistente');
    if (!teams.has(match.homeTeamId)) conflicts.push('homeTeam_inexistente');
    if (!teams.has(match.awayTeamId)) conflicts.push('awayTeam_inexistente');
    if (match.homeTeamId && match.homeTeamId === match.awayTeamId) conflicts.push('homeTeam_igual_awayTeam');
    if (!MATCH_STATUSES.has(match.status)) conflicts.push('status_invalido');
    if (match.status === 'wo') {
      if (match.resultSource !== 'wo') conflicts.push('wo_sem_resultSource');
      const scores = [match.homeScore, match.awayScore].sort((a, b) => b - a);
      if (scores[0] !== 3 || scores[1] !== 0) conflicts.push('wo_sem_placar_3x0');
      if ((eventsByMatch.get(match.id) || []).length > 0) conflicts.push('wo_com_eventos_individuais');
    }
    if (match.status === 'cancelado' && match.winnerId) conflicts.push('cancelada_com_winnerId');
    if (match.status === 'adiado' && match.scheduledAt && new Date(match.scheduledAt).getTime() < Date.now()) {
      conflicts.push('adiada_com_data_passada');
    }
    if (match.status === 'finalizado' && (match.homeScore == null || match.awayScore == null)) {
      conflicts.push('finalizada_sem_placar');
    }
    if (match.nextMatchId && !matches.has(match.nextMatchId)) conflicts.push('nextMatchId_inexistente');
    if (match.status === 'finalizado' && match.winnerId) {
      const winnerByScore = match.homeScore > match.awayScore ? match.homeTeamId : match.awayScore > match.homeScore ? match.awayTeamId : null;
      if (winnerByScore !== match.winnerId) conflicts.push('winnerId_incompativel_com_placar');
    }
    if (match.correctionVersion == null) conflicts.push('correctionVersion_ausente_em_legado');
    if (match.statusVersion == null) conflicts.push('statusVersion_ausente_em_legado');
    if (conflicts.length) {
      issues.push(makeIssue('matches', conflicts.includes('championship_inexistente') ? 'CRITICAL' : 'HIGH', docPath('matches', match.id), 'Partida inconsistente.', { conflicts }));
    }
  }
  for (const change of dataset.match_status_changes) {
    if (!matches.has(change.matchId)) {
      issues.push(makeIssue('matches', 'HIGH', docPath('match_status_changes', change.id), 'Log de status sem partida.', { conflicts: ['match_inexistente'] }));
    } else if (statusChanges.get(change.id) !== change) {
      issues.push(makeIssue('matches', 'LOW', docPath('match_status_changes', change.id), 'Log de status duplicado ou inconsistente.', { conflicts: ['log_inconsistente'] }));
    }
  }
  for (const correction of dataset.match_corrections) {
    if (!matches.has(correction.matchId)) {
      issues.push(makeIssue('matches', 'HIGH', docPath('match_corrections', correction.id), 'Log de correcao sem partida.', { conflicts: ['match_inexistente'] }));
    } else if (corrections.get(correction.id) !== correction) {
      issues.push(makeIssue('matches', 'LOW', docPath('match_corrections', correction.id), 'Log de correcao duplicado ou inconsistente.', { conflicts: ['log_inconsistente'] }));
    }
  }
  return issues;
}

function auditRoundAwards(dataset) {
  const players = byId(dataset.players);
  const byChampRound = groupBy(dataset.round_awards, (award) => (
    award.championshipId && award.round != null ? awardId(award.championshipId, award.round) : null
  ));
  const issues = [];
  for (const award of dataset.round_awards) {
    const conflicts = [];
    const deterministicId = award.championshipId && award.round != null ? awardId(award.championshipId, award.round) : null;
    if (!award.championshipId) conflicts.push('championshipId_ausente');
    if (award.round == null) conflicts.push('round_ausente');
    if (deterministicId && award.id !== deterministicId) conflicts.push('id_automatico_legado');
    if (award.winnerPlayerId && !players.has(award.winnerPlayerId)) conflicts.push('player_inexistente');
    if (conflicts.length) {
      issues.push(makeIssue('round-awards', 'MEDIUM', docPath('round_awards', award.id), 'round_award inconsistente.', { conflicts }));
    }
  }
  for (const [key, list] of byChampRound.entries()) {
    if (list.length <= 1) continue;
    const winners = new Set(list.map((award) => award.winnerPlayerId));
    issues.push(makeIssue(
      'round-awards',
      winners.size > 1 ? 'HIGH' : 'MEDIUM',
      'round_awards/*',
      winners.size > 1 ? 'Awards duplicados com vencedores conflitantes.' : 'Awards duplicados para campeonato + rodada.',
      { conflicts: winners.size > 1 ? ['vencedores_conflitantes'] : ['duplicidade'], details: { key, awardIds: list.map((award) => award.id) } },
    ));
  }
  return issues;
}

function auditDerivedResults(dataset) {
  const issues = [];
  const resultsByChamp = byId(dataset.championship_results);
  for (const championship of dataset.championships.filter((item) => item.status === 'finalizado')) {
    const result = resultsByChamp.get(championship.id);
    if (!result) {
      issues.push(makeIssue('derived-results', 'HIGH', docPath('championships', championship.id), 'Campeonato finalizado sem championship_results.', { suggestedRepair: 'Registrar impacto para futuro bloco de reprocessamento; nao reprocessar neste bloco.' }));
    }
  }
  for (const result of dataset.championship_results) {
    const teams = dataset.teams.filter((team) => team.championshipId === result.championshipId);
    if (result.totalTeams != null && result.totalTeams !== teams.length) {
      issues.push(makeIssue('derived-results', 'MEDIUM', docPath('championship_results', result.id), 'totalTeams diverge da quantidade atual de times.', { details: { resultTotalTeams: result.totalTeams, currentTeams: teams.length } }));
    }
    if (result.winnerId && !teams.some((team) => team.id === result.winnerId)) {
      issues.push(makeIssue('derived-results', 'HIGH', docPath('championship_results', result.id), 'Campeao aponta para time inexistente no campeonato.', { conflicts: ['winnerId_invalido'] }));
    }
  }
  return issues;
}

function auditGroups(dataset) {
  const issues = [];
  const snapshotsByChamp = groupBy(dataset.group_stage_snapshots, (s) => s.championshipId);
  const transitionByChamp = groupBy(dataset.group_transition_logs, (l) => l.championshipId);
  const matchesByChamp = groupBy(dataset.matches, (m) => m.championshipId);
  const teamsByChamp = groupBy(dataset.teams, (t) => t.championshipId);

  for (const championship of dataset.championships) {
    if (!isGroupsFormat(championship)) continue;
    const path = docPath('championships', championship.id);
    const config = championship.groupStageConfig;

    // Config estrutural.
    if (!config) {
      issues.push(makeIssue('groups', 'HIGH', path, 'Campeonato grupos + mata-mata sem groupStageConfig.', {
        conflicts: ['group_config_ausente'],
      }));
    } else if (config.groupCount !== 2) {
      issues.push(makeIssue('groups', 'HIGH', path, 'groupCount diferente de 2 não é suportado.', {
        conflicts: ['group_count_invalido'], details: { groupCount: config.groupCount },
      }));
    }
    if (championship.groupStageStatus != null && !KNOWN_GROUP_STAGE_STATUSES.has(championship.groupStageStatus)) {
      issues.push(makeIssue('groups', 'MEDIUM', path, 'groupStageStatus incompatível.', {
        conflicts: ['group_stage_status_invalido'], details: { groupStageStatus: championship.groupStageStatus },
      }));
    }
    if (championship.knockoutStageStatus != null && !KNOWN_KNOCKOUT_STAGE_STATUSES.has(championship.knockoutStageStatus)) {
      issues.push(makeIssue('groups', 'MEDIUM', path, 'knockoutStageStatus incompatível.', {
        conflicts: ['knockout_stage_status_invalido'], details: { knockoutStageStatus: championship.knockoutStageStatus },
      }));
    }
    // stage ausente é auto-corrigível de forma conservadora quando o estado é inequívoco.
    if (championship.stage == null && (hasGeneratedFixturesFlag(championship) || hasGeneratedKnockoutFlag(championship))) {
      const conservative = hasGeneratedKnockoutFlag(championship) ? 'knockout' : 'group_stage';
      issues.push(makeIssue('groups', 'LOW', path, 'stage ausente em campeonato de grupos já iniciado.', {
        autoFixable: true,
        suggestedRepair: `Preencher stage conservador '${conservative}'.`,
        details: { conservativeStage: conservative },
      }));
    } else if (championship.stage != null && !KNOWN_CHAMPIONSHIP_STAGES.has(championship.stage)) {
      issues.push(makeIssue('groups', 'MEDIUM', path, 'stage inválido.', {
        conflicts: ['stage_invalido'], details: { stage: championship.stage },
      }));
    }

    const teams = (teamsByChamp.get(championship.id) || []).filter(isApprovedActiveTeam);
    const generatedGroups = hasGeneratedGroupsFlag(championship);
    const groupSizes = { A: 0, B: 0 };
    if (generatedGroups) {
      for (const team of teams) {
        const teamPath = docPath('teams', team.id);
        const label = normalizeGroupLabel(team.groupId);
        if (team.groupId == null || team.groupId === '') {
          issues.push(makeIssue('groups', 'HIGH', teamPath, 'Time aprovado sem groupId após sorteio dos grupos.', {
            conflicts: ['time_sem_grupo'],
          }));
          continue;
        }
        if (!label) {
          issues.push(makeIssue('groups', 'HIGH', teamPath, 'groupId inválido (não normaliza para A/B).', {
            conflicts: ['group_id_invalido'], details: { groupId: team.groupId },
          }));
          continue;
        }
        groupSizes[label] += 1;
        if (team.groupSeed == null || team.groupSeed < 1) {
          issues.push(makeIssue('groups', 'MEDIUM', teamPath, 'groupSeed inválido.', {
            conflicts: ['group_seed_invalido'], details: { groupSeed: team.groupSeed ?? null },
          }));
        }
        if (
          championship.groupGenerationVersion != null &&
          team.groupAssignmentVersion != null &&
          team.groupAssignmentVersion !== championship.groupGenerationVersion
        ) {
          issues.push(makeIssue('groups', 'MEDIUM', teamPath, 'groupAssignmentVersion divergente da geração atual.', {
            conflicts: ['group_assignment_version_divergente'],
            details: { teamVersion: team.groupAssignmentVersion, championshipVersion: championship.groupGenerationVersion },
          }));
        }
      }
      if (Math.abs(groupSizes.A - groupSizes.B) > 1) {
        issues.push(makeIssue('groups', 'MEDIUM', path, 'Grupos desbalanceados (diferença maior que 1).', {
          conflicts: ['grupos_desbalanceados'], details: groupSizes,
        }));
      }
    }

    // Partidas de grupo e mata-mata.
    const champMatches = matchesByChamp.get(championship.id) || [];
    const groupMatches = champMatches.filter((m) => m.stage === 'group');
    const teamGroup = new Map(teams.map((t) => [t.id, normalizeGroupLabel(t.groupId)]));
    const seenPairs = new Set();
    for (const match of groupMatches) {
      const mPath = docPath('matches', match.id);
      if (match.groupId == null || match.groupId === '') {
        issues.push(makeIssue('groups', 'HIGH', mPath, 'Partida de grupo sem groupId.', { conflicts: ['group_match_sem_group'] }));
        continue;
      }
      const homeG = teamGroup.get(match.homeTeamId);
      const awayG = teamGroup.get(match.awayTeamId);
      if (homeG && awayG && homeG !== awayG) {
        issues.push(makeIssue('groups', 'HIGH', mPath, 'Partida de grupo entre times de grupos diferentes.', {
          conflicts: ['partida_cross_group'], details: { home: homeG, away: awayG },
        }));
      }
      const pairKey = `${normalizeGroupLabel(match.groupId)}:${[match.homeTeamId, match.awayTeamId].sort().join('_')}`;
      if (seenPairs.has(pairKey)) {
        issues.push(makeIssue('groups', 'HIGH', mPath, 'Partida de grupo duplicada (mesmo par no mesmo grupo).', {
          conflicts: ['fixture_duplicada'], details: { pairKey },
        }));
      }
      seenPairs.add(pairKey);
    }
    if (hasGeneratedFixturesFlag(championship)) {
      const expected = expectedGroupFixtureCount(groupSizes.A) + expectedGroupFixtureCount(groupSizes.B);
      if (groupMatches.length === 0) {
        issues.push(makeIssue('groups', 'HIGH', path, 'Fixtures marcadas como geradas, mas não há partidas de grupo.', {
          conflicts: ['fixtures_ausentes'],
        }));
      } else if (generatedGroups && expected > 0 && groupMatches.length < expected) {
        issues.push(makeIssue('groups', 'HIGH', path, 'Partidas de grupo incompletas (estrutura parcial).', {
          conflicts: ['fixtures_parciais'], details: { expected, actual: groupMatches.length },
        }));
      }
    }

    // Transição / snapshot / bracket.
    const knockoutMatches = champMatches.filter((m) => m.stage === 'knockout');
    const snapshots = snapshotsByChamp.get(championship.id) || [];
    const generatedKnockout = hasGeneratedKnockoutFlag(championship) || knockoutMatches.length > 0;
    if (generatedKnockout && snapshots.length === 0) {
      issues.push(makeIssue('groups', 'CRITICAL', path, 'Mata-mata gerado sem snapshot de classificados.', {
        conflicts: ['snapshot_ausente'],
      }));
    }
    for (const snapshot of snapshots) {
      const sPath = docPath('group_stage_snapshots', snapshot.id);
      if (snapshot.version == null || snapshot.version < 1) {
        issues.push(makeIssue('groups', 'HIGH', sPath, 'Snapshot com version inválida.', { conflicts: ['snapshot_version_invalida'] }));
      }
      if (!snapshot.standingsDigest) {
        issues.push(makeIssue('groups', 'HIGH', sPath, 'Snapshot sem standingsDigest (digest divergente/ausente).', {
          conflicts: ['snapshot_digest_ausente'],
        }));
      }
      const transition = (transitionByChamp.get(championship.id) || [])[0];
      if (transition && transition.snapshotDigest && snapshot.standingsDigest && transition.snapshotDigest !== snapshot.standingsDigest) {
        issues.push(makeIssue('groups', 'HIGH', sPath, 'Digest do snapshot divergente do log de transição.', {
          conflicts: ['digest_divergente'],
          details: { snapshotDigest: snapshot.standingsDigest, transitionDigest: transition.snapshotDigest },
        }));
      }
    }
    for (const match of knockoutMatches) {
      if (match.originSnapshotVersion == null) {
        issues.push(makeIssue('groups', 'MEDIUM', docPath('matches', match.id), 'Partida de mata-mata sem originSnapshotVersion.', {
          conflicts: ['knockout_sem_origin_snapshot'],
        }));
      }
    }
    if (generatedKnockout) {
      if (championship.groupStageLockedAt == null) {
        issues.push(makeIssue('groups', 'MEDIUM', path, 'groupStageLockedAt ausente após a transição.', {
          conflicts: ['group_stage_locked_at_ausente'],
        }));
      }
      if (championship.knockoutGeneratedAt == null) {
        issues.push(makeIssue('groups', 'MEDIUM', path, 'knockoutGeneratedAt ausente após a transição.', {
          conflicts: ['knockout_generated_at_ausente'],
        }));
      }
    }

    // Cancelada/adiada bloqueando conclusão + W.O. inconsistente em partida de grupo.
    for (const match of groupMatches) {
      if ((match.status === 'cancelado' || match.status === 'adiado') && !hasGeneratedKnockoutFlag(championship)) {
        issues.push(makeIssue('groups', 'INFO', docPath('matches', match.id), 'Partida de grupo cancelada/adiada bloqueia a conclusão até resolução administrativa.', {
          details: { status: match.status },
        }));
      }
      if (match.status === 'wo') {
        const scores = [match.homeScore, match.awayScore].filter((s) => s != null).sort((a, b) => b - a);
        if (match.resultSource !== 'wo' || scores[0] !== 3 || scores[1] !== 0) {
          issues.push(makeIssue('groups', 'HIGH', docPath('matches', match.id), 'W.O. de grupo inconsistente (esperado 3x0 com resultSource=wo).', {
            conflicts: ['wo_inconsistente'],
          }));
        }
      }
    }
  }
  return issues;
}

function auditLegacyData(rawDataset, options = {}) {
  const dataset = normalizeDataset(rawDataset);
  const report = createBaseReport(dataset, options);
  const categoryAudits = {
    'team-memberships': auditTeamMemberships,
    'approved-player-counts': auditApprovedPlayerCounts,
    'registered-team-counts': auditRegisteredTeamCounts,
    'orphan-players': auditOrphanPlayers,
    captains: auditCaptains,
    'legacy-convocations': auditLegacyConvocations,
    'current-convocations-attendance': auditCurrentConvocationsAndAttendance,
    matches: auditMatches,
    'round-awards': auditRoundAwards,
    'derived-results': auditDerivedResults,
    groups: auditGroups,
  };

  for (const [category, fn] of Object.entries(categoryAudits)) {
    if (options.categories && options.categories.length && !options.categories.includes(category)) continue;
    collectIssues(report, category, fn(dataset));
  }

  report.proposedChanges = buildBackfillPlan(dataset, report, options).changes;
  return finalizeReport(report);
}

function buildBackfillPlan(rawDataset, report, options = {}) {
  const dataset = normalizeDataset(rawDataset);
  const categories = options.categories && options.categories.length ? new Set(options.categories) : null;
  const limit = options.limit == null ? Infinity : Number(options.limit);
  const now = options.now || new Date().toISOString();
  const changes = [];
  const addChange = (change) => {
    if (changes.length >= limit) return;
    if (categories && !categories.has(change.category)) return;
    changes.push({
      migrationVersion: MIGRATION_VERSION,
      ...change,
    });
  };

  planTeamMembershipBackfill(dataset, addChange, now);
  planApprovedCountBackfill(dataset, addChange, report);
  planRegisteredCountBackfill(dataset, addChange, report);
  planLegacyConvocationBackfill(dataset, addChange, now);
  planGroupStageBackfill(dataset, addChange);

  return { changes };
}

// Backfill conservador do formato grupos: preenche apenas `stage` ausente quando
// o estado é inequívoco. NUNCA atribui grupo, gera fixture, cria snapshot ou
// regenera bracket, e NUNCA converte formato antigo para grupos.
function planGroupStageBackfill(dataset, addChange) {
  for (const championship of dataset.championships) {
    if (!isGroupsFormat(championship)) continue;
    if (championship.stage != null) continue;
    if (!hasGeneratedFixturesFlag(championship) && !hasGeneratedKnockoutFlag(championship)) continue;
    const stage = hasGeneratedKnockoutFlag(championship) ? 'knockout' : 'group_stage';
    addChange({
      category: 'groups',
      operation: 'update',
      documentPath: docPath('championships', championship.id),
      collection: 'championships',
      id: championship.id,
      before: { stage: championship.stage ?? null },
      after: { stage },
      reason: 'Preenchimento conservador de stage para campeonato de grupos já iniciado.',
    });
  }
}

function planTeamMembershipBackfill(dataset, addChange, now) {
  const teams = byId(dataset.teams);
  const users = byId(dataset.users);
  const championships = byId(dataset.championships);
  const memberships = byId(dataset.team_memberships);
  const conflicts = findStructuralPlayerConflicts(dataset);
  for (const player of dataset.players) {
    if (!isRosterSlotPlayer(player) || !player.userId || !player.teamId || !player.championshipId) continue;
    const team = teams.get(player.teamId);
    if (!team || !users.has(player.userId) || !championships.has(player.championshipId)) continue;
    if (team.championshipId !== player.championshipId) continue;
    if (conflicts.multiTeamByChampUser.has(`${player.championshipId}_${player.userId}`)) continue;
    const id = membershipId(player.teamId, player.userId);
    if (memberships.has(id)) continue;
    const after = {
      teamId: player.teamId,
      championshipId: player.championshipId,
      userId: player.userId,
      playerId: player.id,
      status: player.status || 'ativo',
      active: true,
      createdByMigration: true,
      migrationVersion: MIGRATION_VERSION,
      migratedAt: now,
      sourcePlayerId: player.id,
      updatedAt: now,
    };
    addChange({
      category: 'team-memberships',
      operation: 'set',
      documentPath: docPath('team_memberships', id),
      collection: 'team_memberships',
      id,
      before: null,
      after,
      reason: 'Backfill seguro de membership ausente.',
    });
  }
}

function issueHasBlockingConflict(report, category, path) {
  if (!report) return false;
  return report.issues.some(
    (issue) =>
      issue.category === category &&
      issue.documentPath === path &&
      !issue.autoFixable &&
      issue.severity !== 'INFO',
  );
}

function planApprovedCountBackfill(dataset, addChange, report) {
  for (const team of dataset.teams) {
    const path = docPath('teams', team.id);
    if (issueHasBlockingConflict(report, 'approved-player-counts', path)) continue;
    const realCount = dataset.players.filter((player) => player.teamId === team.id && isRosterSlotPlayer(player)).length;
    if (team.approvedPlayersCount === realCount) continue;
    addChange({
      category: 'approved-player-counts',
      operation: 'update',
      documentPath: path,
      collection: 'teams',
      id: team.id,
      before: { approvedPlayersCount: team.approvedPlayersCount ?? null },
      after: { approvedPlayersCount: realCount },
      reason: 'Recalculo seguro do contador denormalizado de atletas.',
    });
  }
}

function planRegisteredCountBackfill(dataset, addChange, report) {
  const teamsByChamp = groupBy(dataset.teams, (team) => team.championshipId);
  for (const championship of dataset.championships) {
    const path = docPath('championships', championship.id);
    if (issueHasBlockingConflict(report, 'registered-team-counts', path)) continue;
    const realCount = (teamsByChamp.get(championship.id) || []).filter(teamOccupiesRegistrationSlot).length;
    if (championship.registeredTeamsCount === realCount) continue;
    addChange({
      category: 'registered-team-counts',
      operation: 'update',
      documentPath: path,
      collection: 'championships',
      id: championship.id,
      before: { registeredTeamsCount: championship.registeredTeamsCount ?? null },
      after: { registeredTeamsCount: realCount },
      reason: 'Recalculo seguro do contador denormalizado de times conforme regra atual.',
    });
  }
}

function planLegacyConvocationBackfill(dataset, addChange, now) {
  const teams = byId(dataset.teams);
  const players = byId(dataset.players);
  const current = byId(dataset.match_convocations);
  for (const legacy of dataset.legacyConvocations) {
    const team = teams.get(legacy.teamId);
    if (!team) continue;
    const round = Number(legacy.round || legacy.id);
    const matches = dataset.matches.filter(
      (match) =>
        match.championshipId === team.championshipId &&
        Number(match.round) === round &&
        (match.homeTeamId === team.id || match.awayTeamId === team.id),
    );
    if (matches.length !== 1) continue;
    const invalidPlayer = (legacy.playerIds || []).some((playerId) => {
      const player = players.get(playerId);
      return !player || player.teamId !== team.id || !isRosterSlotPlayer(player);
    });
    if (invalidPlayer) continue;
    const id = convocationId(matches[0].id, team.id);
    if (current.has(id)) continue;
    const status = matches[0].status === 'cancelado'
      ? 'cancelled'
      : matches[0].status === 'wo' || matches[0].status === 'finalizado'
        ? 'completed'
        : 'open';
    const after = {
      id,
      championshipId: team.championshipId,
      matchId: matches[0].id,
      teamId: team.id,
      captainId: team.captainId,
      playerIds: legacy.playerIds || [],
      status,
      responseDeadline: legacy.responseDeadline || null,
      requiresReconfirmation: matches[0].status === 'adiado',
      version: 1,
      previousVersion: null,
      createdAt: legacy.createdAt || now,
      updatedAt: now,
      migratedFromLegacy: true,
      legacySourcePath: legacy.path || `teams/${team.id}/convocations/${legacy.id}`,
      migrationVersion: MIGRATION_VERSION,
      migratedAt: now,
    };
    addChange({
      category: 'legacy-convocations',
      operation: 'set',
      documentPath: docPath('match_convocations', id),
      collection: 'match_convocations',
      id,
      before: null,
      after,
      reason: 'Migracao segura de convocacao legada nao ambigua.',
    });
  }
}

function toMarkdownReport(report) {
  const lines = [
    `# Migration Audit - ${report.generatedAt}`,
    '',
    `- Projeto: ${report.projectId}`,
    `- Ambiente: ${report.environment}`,
    `- Modo: ${report.mode}`,
    `- Versao: ${report.migrationVersion}`,
    `- Documentos analisados: ${report.totalDocuments}`,
    '',
    '## Resumo executivo',
    '',
    `- Total de problemas: ${report.summary.totalIssues}`,
    `- CRITICAL: ${report.summary.critical}`,
    `- HIGH: ${report.summary.high}`,
    `- MEDIUM: ${report.summary.medium}`,
    `- LOW: ${report.summary.low}`,
    `- INFO: ${report.summary.info}`,
    `- Corrigiveis automaticamente: ${report.summary.autoFixable}`,
    `- Revisao manual: ${report.summary.manualReview}`,
    `- Mudancas propostas: ${report.summary.totalProposedChanges}`,
    '',
    '## Colecoes analisadas',
    '',
  ];
  for (const [collection, count] of Object.entries(report.collectionCounts)) {
    lines.push(`- ${collection}: ${count}`);
  }
  lines.push('', '## Problemas por categoria', '');
  for (const [category, data] of Object.entries(report.categories)) {
    lines.push(`### ${category}`, '');
    lines.push(`- Total: ${data.total}`);
    lines.push(`- Auto-fix: ${data.autoFixable}`);
    lines.push(`- Manual: ${data.manualReview}`);
    lines.push('');
    for (const issue of data.issues) {
      lines.push(`- [${issue.severity}] ${issue.documentPath}: ${issue.message}`);
      lines.push(`  - Reparo sugerido: ${issue.suggestedRepair}`);
      if (issue.conflicts && issue.conflicts.length) {
        lines.push(`  - Conflitos: ${issue.conflicts.join(', ')}`);
      }
    }
    lines.push('');
  }
  lines.push('## Mudancas propostas', '');
  for (const change of report.proposedChanges) {
    lines.push(`- ${change.category} ${change.operation} ${change.documentPath}: ${change.reason}`);
  }
  if (report.proposedChanges.length === 0) lines.push('- Nenhuma mudanca automatica proposta.');
  lines.push('', '## Observacoes', '');
  lines.push('- Este relatorio nao executa migracao por padrao.');
  lines.push('- Execute apply apenas em Emulator ou ambiente explicitamente confirmado.');
  lines.push('- championship_results e derivados sao somente auditados neste bloco.');
  return `${lines.join('\n')}\n`;
}

function toManualReviewMarkdown(report) {
  const manual = report.issues.filter((issue) => !issue.autoFixable && issue.severity !== 'INFO');
  const lines = [
    `# Manual Review - ${report.generatedAt}`,
    '',
    `- Projeto: ${report.projectId}`,
    `- Ambiente: ${report.environment}`,
    `- Itens manuais: ${manual.length}`,
    '',
  ];
  for (const issue of manual) {
    lines.push(`## ${issue.severity} - ${issue.category}`);
    lines.push('');
    lines.push(`- Documento: ${issue.documentPath}`);
    lines.push(`- Problema: ${issue.message}`);
    lines.push(`- Reparo sugerido: ${issue.suggestedRepair}`);
    if (issue.conflicts && issue.conflicts.length) lines.push(`- Conflitos: ${issue.conflicts.join(', ')}`);
    lines.push('');
  }
  if (manual.length === 0) lines.push('Nenhum item manual encontrado.');
  return `${lines.join('\n')}\n`;
}

module.exports = {
  MIGRATION_VERSION,
  COLLECTIONS,
  auditLegacyData,
  buildBackfillPlan,
  toMarkdownReport,
  toManualReviewMarkdown,
  normalizeDataset,
  isRosterSlotPlayer,
  membershipId,
  convocationId,
  attendanceId,
  awardId,
};
