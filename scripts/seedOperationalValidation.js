const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const TEST_USER_PASSWORD = process.env.FJU_TEST_PASSWORD || 'FjuBlock7!2026';
const PROJECT_HINT = 'Use --project-id=fju-operational-emulator ou outro projeto com dev/test/emulator/staging/qa no nome.';
const PREFIX = 'ov_';

function parseArgs(argv) {
  const args = {
    reset: false,
    seedAuth: false,
  };
  for (const arg of argv) {
    if (arg === '--reset') args.reset = true;
    else if (arg === '--seed-auth') args.seedAuth = true;
    else if (arg.startsWith('--project-id=')) args.projectId = arg.split('=')[1];
  }
  return args;
}

function getProjectId(args) {
  return args.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
}

function assertSafeTarget(projectId) {
  if (!projectId) {
    throw new Error(`Informe --project-id=<id>. ${PROJECT_HINT}`);
  }

  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const lower = projectId.toLowerCase();
  const looksDev = /dev|test|local|emulator|staging|qa/.test(lower);
  const looksProduction = /prod|production|fju-championship/.test(lower);

  if (looksProduction) {
    throw new Error(
      `Recusado: alvo "${projectId}" parece projeto de producao. Use um project-id dev/test/emulator. ${PROJECT_HINT}`,
    );
  }

  if (!firestoreEmulator && !looksDev) {
    throw new Error(
      `Recusado: alvo "${projectId}" nao parece ambiente de desenvolvimento seguro. ` +
        `Defina FIRESTORE_EMULATOR_HOST ou use um project-id dev/test explicito. ${PROJECT_HINT}`,
    );
  }

  return {
    projectId,
    firestoreEmulator: firestoreEmulator || null,
    authEmulator: process.env.FIREBASE_AUTH_EMULATOR_HOST || null,
  };
}

function initialize(projectId) {
  try {
    admin.app();
  } catch {
    admin.initializeApp({ projectId });
  }
  return getFirestore();
}

function getFirebaseAuth() {
  const { getAuth } = require('firebase-admin/auth');
  return getAuth();
}

function iso(day, hour = '12:00:00') {
  return `2026-07-${String(day).padStart(2, '0')}T${hour}.000Z`;
}

const rules = {
  pointsWin: 3,
  pointsDraw: 1,
  pointsLoss: 0,
  tiebreakers: ['points', 'wins', 'goalDifference', 'goalsFor', 'fairPlay'],
  fairPlay: true,
  roundAwards: true,
  craqueDaRodada: true,
  yellowCardLimit: 3,
  redCardSuspend: true,
  manualApproval: true,
};

function user(id, name, role, extra = {}) {
  return [`users/${id}`, { id, name, email: `${id}@operational.fju.local`, role, ...extra }];
}

function allowlist(id, enabled = true) {
  return [`organizer_allowlist/${id}`, { uid: id, enabled, updatedAt: iso(1) }];
}

function championship(id, name, format, status, organizerId, extra = {}) {
  return [
    `championships/${id}`,
    {
      id,
      name,
      format,
      status,
      currentRound: 1,
      totalRounds: format === 'pontos_corridos' ? 3 : 3,
      organizerId,
      inviteCode: `${id.toUpperCase()}-JOIN`,
      rules,
      createdAt: iso(1),
      maxPlayers: 8,
      maxTeams: 8,
      registeredTeamsCount: 0,
      fixturesGenerated: true,
      season: '2026',
      edition: 7,
      isOfficial: false,
      ...extra,
    },
  ];
}

function team(id, championshipId, name, captainId, index, extra = {}) {
  return [
    `teams/${id}`,
    {
      id,
      championshipId,
      name,
      primaryColor: ['#123C69', '#D62828', '#2A9D8F', '#6A4C93', '#F77F00', '#1D3557'][index % 6],
      secondaryColor: '#F8FAFC',
      captainId,
      status: 'aprovado',
      inviteCode: `${id.toUpperCase()}-CODE`,
      createdAt: iso(1, `0${(index % 8) + 8}:00:00`),
      approvedPlayersCount: 0,
      registrationOpen: true,
      ...extra,
    },
  ];
}

function player(id, championshipId, teamId, userId, name, number, status = 'ativo', extra = {}) {
  return [
    `players/${id}`,
    {
      id,
      championshipId,
      teamId,
      userId,
      name,
      position: number === 1 ? 'goleiro' : number % 2 === 0 ? 'meia' : 'atacante',
      number,
      status,
      joinedAt: iso(1),
      yellowCards: status === 'suspenso' ? 3 : 0,
      suspendedRound: status === 'suspenso' ? 1 : null,
      ...extra,
    },
  ];
}

function membership(teamId, userId, championshipId, status = 'ativo', active = true) {
  const id = `${teamId}_${userId}`;
  return [
    `team_memberships/${id}`,
    {
      id,
      teamId,
      userId,
      championshipId,
      status,
      active,
      updatedAt: iso(1),
    },
  ];
}

function match(id, championshipId, round, homeTeamId, awayTeamId, status, extra = {}) {
  return [
    `matches/${id}`,
    {
      id,
      championshipId,
      round,
      homeTeamId,
      awayTeamId,
      homeScore: status === 'agendado' || status === 'adiado' || status === 'cancelado' ? null : 0,
      awayScore: status === 'agendado' || status === 'adiado' || status === 'cancelado' ? null : 0,
      status,
      scheduledAt: iso(round + 3, '19:30:00'),
      location: 'Arena Operacional',
      statusVersion: 0,
      correctionVersion: 0,
      resultSource: status === 'wo' ? 'wo' : 'played',
      ...extra,
    },
  ];
}

function event(id, matchId, championshipId, type, teamId, playerId, minute, extra = {}) {
  return [
    `match_events/${id}`,
    {
      id,
      matchId,
      championshipId,
      type,
      teamId,
      playerId,
      minute,
      createdAt: iso(2, '20:00:00'),
      ...extra,
    },
  ];
}

function convocation(matchId, teamId, championshipId, captainId, playerIds, extra = {}) {
  const id = `${matchId}_${teamId}`;
  return [
    `match_convocations/${id}`,
    {
      id,
      championshipId,
      matchId,
      teamId,
      captainId,
      playerIds,
      status: 'open',
      responseDeadline: iso(8, '17:00:00'),
      requiresReconfirmation: false,
      version: 1,
      previousVersion: null,
      createdAt: iso(2),
      updatedAt: iso(2),
      ...extra,
    },
  ];
}

function attendance(matchId, playerId, championshipId, teamId, userId, response, extra = {}) {
  const id = `${matchId}_${playerId}`;
  return [
    `match_attendance/${id}`,
    {
      id,
      championshipId,
      matchId,
      teamId,
      playerId,
      userId,
      response,
      respondedAt: response === 'pending' ? null : iso(2, '21:00:00'),
      declineReason: response === 'declined' ? 'Compromisso familiar' : null,
      version: 1,
      reconfirmationRequired: false,
      previousResponse: null,
      updatedAt: iso(2, '21:00:00'),
      ...extra,
    },
  ];
}

function statusChange(id, matchId, championshipId, type, beforeStatus, afterStatus, organizerId, extra = {}) {
  return [
    `match_status_changes/${id}`,
    {
      id,
      championshipId,
      matchId,
      organizerId,
      type,
      reason: `Seed operacional: ${type}`,
      beforeStatus,
      afterStatus,
      beforeDate: iso(4, '19:30:00'),
      afterDate: iso(6, '19:30:00'),
      beforeScore: { homeScore: null, awayScore: null },
      afterScore: { homeScore: null, awayScore: null },
      winnerId: null,
      createdAt: iso(2),
      version: 1,
      derivedEffects: ['status'],
      ...extra,
    },
  ];
}

function notification(id, userId, type, title, body, data = {}) {
  const doc = {
    id,
    userId,
    type,
    title,
    body,
    data,
    read: false,
    createdAt: iso(2),
  };
  return [
    [`notifications/${id}`, doc],
    [`in_app_notifications/${id}`, doc],
  ];
}

const GROUP_CONFIG = {
  version: 1,
  groupCount: 2,
  qualifiersPerGroup: 1,
  includeBestThirdPlaced: false,
  bestThirdPlacedCount: 0,
  drawMethod: 'random',
  tiebreakers: ['points', 'wins', 'goal_difference', 'goals_for', 'head_to_head', 'fewest_cards', 'deterministic_draw'],
};

function groupTeamEntry(champId, id, name, captainId, group, seed, index, extra = {}) {
  return team(id, champId, name, captainId, index, {
    approvedPlayersCount: 1,
    groupId: group,
    groupSeed: seed,
    groupAssignmentVersion: 1,
    ...extra,
  });
}

function groupMatchEntry(id, champId, group, home, away, status, round, extra = {}) {
  return match(id, champId, round, home, away, status, {
    stage: 'group',
    groupId: group,
    groupRound: round,
    structureVersion: 1,
    groupGenerationVersion: 1,
    ...extra,
  });
}

// Bloco 10.5 — Campeonatos D (grupos em andamento), E (transição concluída) e
// F (diagnóstico com inconsistências controladas para a auditoria).
function buildGroupsDocs() {
  const out = [];
  const push = (...pairs) => pairs.forEach((p) => out.push(p));

  // ── Campeonato D — grupos em andamento ──────────────────────────────────────
  push(
    championship('ov_champ_d', 'Operacional D - Grupos em andamento', 'grupos_e_mata_mata', 'em_andamento', 'ov_org_owner', {
      maxTeams: 6,
      registeredTeamsCount: 6,
      stage: 'group_stage',
      groupStageConfig: GROUP_CONFIG,
      groupStageStatus: 'fixtures_generated',
      knockoutStageStatus: 'not_generated',
      groupGenerationVersion: 1,
      groupFixturesVersion: 1,
      groupStructureVersion: 1,
    }),
  );
  // 3 times por grupo → 3 partidas por grupo (round-robin completo = 6 no total).
  const dTeams = [
    ['ov_d_team_1', 'A1', 'A', 1], ['ov_d_team_2', 'A2', 'A', 2], ['ov_d_team_3', 'A3', 'A', 3],
    ['ov_d_team_4', 'B1', 'B', 1], ['ov_d_team_5', 'B2', 'B', 2], ['ov_d_team_6', 'B3', 'B', 3],
  ];
  dTeams.forEach(([id, name, group, seed], i) => {
    push(groupTeamEntry('ov_champ_d', id, `D ${name}`, 'ov_cap_alpha', group, seed, i));
    push(player(`ov_d_p${i + 1}`, 'ov_champ_d', id, `ov_ath_0${(i % 8) + 1}`, `D Atleta ${name}`, i + 1, 'ativo'));
    push(membership(id, `ov_ath_0${(i % 8) + 1}`, 'ov_champ_d', 'ativo', true));
  });
  push(
    // Grupo A completo: finalizado (empate em pontos), W.O. e agendado.
    groupMatchEntry('ov_d_a12', 'ov_champ_d', 'A', 'ov_d_team_1', 'ov_d_team_2', 'finalizado', 1, { homeScore: 0, awayScore: 0, winnerId: null }),
    groupMatchEntry('ov_d_a13', 'ov_champ_d', 'A', 'ov_d_team_1', 'ov_d_team_3', 'wo', 1, { homeScore: 3, awayScore: 0, winnerId: 'ov_d_team_1', resultSource: 'wo' }),
    groupMatchEntry('ov_d_a23', 'ov_champ_d', 'A', 'ov_d_team_2', 'ov_d_team_3', 'agendado', 2),
    // Grupo B completo: finalizado, adiado e cancelado (bloqueiam conclusão — INFO).
    groupMatchEntry('ov_d_b12', 'ov_champ_d', 'B', 'ov_d_team_4', 'ov_d_team_5', 'finalizado', 1, { homeScore: 0, awayScore: 0, winnerId: null }),
    groupMatchEntry('ov_d_b13', 'ov_champ_d', 'B', 'ov_d_team_4', 'ov_d_team_6', 'adiado', 2),
    groupMatchEntry('ov_d_b23', 'ov_champ_d', 'B', 'ov_d_team_5', 'ov_d_team_6', 'cancelado', 2),
  );
  push(
    ['group_assignment_logs/ov_group_assignment_champ_d_1', {
      id: 'ov_group_assignment_champ_d_1', championshipId: 'ov_champ_d', generationVersion: 1, algorithmVersion: 1,
      drawSeed: 'ov-seed-d', assignments: dTeams.map(([id, , group, seed], i) => ({ teamId: id, groupId: group, groupSeed: seed, assignmentOrder: i })),
      createdBy: 'ov_org_owner', createdAt: iso(1),
    }],
    ['group_fixture_logs/ov_group_fixtures_champ_d_1', {
      id: 'ov_group_fixtures_champ_d_1', championshipId: 'ov_champ_d', fixturesVersion: 1, groupGenerationVersion: 1,
      structureVersion: 1, fixtureIds: ['ov_d_a12', 'ov_d_a13', 'ov_d_a23', 'ov_d_b12', 'ov_d_b13', 'ov_d_b23'],
      fixtureCount: 6, groupCounts: { groupA: 3, groupB: 3 }, createdBy: 'ov_org_owner', createdAt: iso(1),
    }],
  );
  push(
    ['match_convocations/ov_d_a12_ov_d_team_1', {
      id: 'ov_d_a12_ov_d_team_1', championshipId: 'ov_champ_d', matchId: 'ov_d_a12', teamId: 'ov_d_team_1',
      captainId: 'ov_cap_alpha', playerIds: ['ov_d_p1'], status: 'completed', requiresReconfirmation: false, version: 1, createdAt: iso(1), updatedAt: iso(1),
    }],
    ['match_attendance/ov_d_a12_ov_d_p1', {
      id: 'ov_d_a12_ov_d_p1', championshipId: 'ov_champ_d', matchId: 'ov_d_a12', teamId: 'ov_d_team_1',
      playerId: 'ov_d_p1', userId: 'ov_ath_01', response: 'confirmed', version: 1, updatedAt: iso(1),
    }],
  );

  // ── Campeonato E — transição concluída ──────────────────────────────────────
  push(
    championship('ov_champ_e', 'Operacional E - Mata-mata gerado', 'grupos_e_mata_mata', 'em_andamento', 'ov_org_owner', {
      maxTeams: 4,
      registeredTeamsCount: 4,
      stage: 'knockout',
      groupStageConfig: GROUP_CONFIG,
      groupStageStatus: 'completed',
      knockoutStageStatus: 'generated',
      groupGenerationVersion: 1,
      groupFixturesVersion: 1,
      groupStructureVersion: 1,
      groupSnapshotVersion: 1,
      knockoutGenerationVersion: 1,
      groupStageComplete: true,
      groupStageLockedAt: iso(2),
      knockoutGeneratedAt: iso(2),
    }),
  );
  const eTeams = [['ov_e_team_1', 'A1', 'A', 1], ['ov_e_team_2', 'A2', 'A', 2], ['ov_e_team_3', 'B1', 'B', 1], ['ov_e_team_4', 'B2', 'B', 2]];
  eTeams.forEach(([id, name, group, seed], i) => {
    push(groupTeamEntry('ov_champ_e', id, `E ${name}`, 'ov_cap_beta', group, seed, i));
    push(player(`ov_e_p${i + 1}`, 'ov_champ_e', id, `ov_ath_0${(i % 8) + 1}`, `E Atleta ${name}`, i + 1, 'ativo'));
    push(membership(id, `ov_ath_0${(i % 8) + 1}`, 'ov_champ_e', 'ativo', true));
  });
  push(
    groupMatchEntry('ov_e_a12', 'ov_champ_e', 'A', 'ov_e_team_1', 'ov_e_team_2', 'finalizado', 1, { homeScore: 1, awayScore: 0, winnerId: 'ov_e_team_1' }),
    groupMatchEntry('ov_e_b12', 'ov_champ_e', 'B', 'ov_e_team_3', 'ov_e_team_4', 'finalizado', 1, { homeScore: 2, awayScore: 1, winnerId: 'ov_e_team_3' }),
    match('ov_e_ko_final', 'ov_champ_e', 2, 'ov_e_team_1', 'ov_e_team_3', 'agendado', {
      stage: 'knockout', groupId: null, knockoutRound: 'final', bracketRound: 'final', structureVersion: 1, originSnapshotVersion: 1, nextMatchId: null,
    }),
  );
  push(
    ['group_stage_snapshots/champ__ov_champ_e__group_snapshot__1', {
      id: 'champ__ov_champ_e__group_snapshot__1', version: 1, championshipId: 'ov_champ_e', configVersion: 1,
      groupGenerationVersion: 1, groupFixturesVersion: 1, structureVersion: 1, qualifiersPerGroup: 1,
      standingsDigest: 'ov-digest-e-1', generatedBy: 'ov_org_owner', generatedAt: iso(2),
      qualifiers: [
        { teamId: 'ov_e_team_1', groupId: 'A', position: 1, groupPosition: 1, points: 3, wins: 1, goalDifference: 1, goalsFor: 1, deterministicSeed: 's-e-a1' },
        { teamId: 'ov_e_team_3', groupId: 'B', position: 1, groupPosition: 1, points: 3, wins: 1, goalDifference: 1, goalsFor: 2, deterministicSeed: 's-e-b1' },
      ],
    }],
    ['group_transition_logs/ov_group_transition_champ_e_1', {
      id: 'ov_group_transition_champ_e_1', championshipId: 'ov_champ_e', transitionVersion: 1,
      snapshotId: 'champ__ov_champ_e__group_snapshot__1', snapshotDigest: 'ov-digest-e-1', knockoutGenerationVersion: 1,
      qualifierIds: ['ov_e_team_1', 'ov_e_team_3'], fixtureIds: ['ov_e_ko_final'], createdBy: 'ov_org_owner', createdAt: iso(2),
    }],
  );
  for (const pair of notification('ov_notif_qualified', 'ov_ath_01', 'group_stage_started', 'Classificado!', 'Seu time avancou para o mata-mata.', { championshipId: 'ov_champ_e' })) push(pair);

  // ── Campeonato F — diagnóstico com inconsistências controladas ──────────────
  push(
    championship('ov_champ_f', 'Operacional F - Diagnostico invalido', 'grupos_e_mata_mata', 'em_andamento', 'ov_org_owner', {
      maxTeams: 4,
      registeredTeamsCount: 4,
      // Inconsistência 1: sem groupStageConfig.
      groupStageStatus: 'groups_generated',
      // Inconsistência 2: knockout marcado como gerado sem snapshot/lockedAt.
      knockoutStageStatus: 'generated',
      groupGenerationVersion: 1,
      knockoutGenerationVersion: 1,
      groupFixturesVersion: 1,
    }),
  );
  // Inconsistência 3: time sem groupId; Inconsistência 4: groupId inválido.
  push(groupTeamEntry('ov_champ_f', 'ov_f_team_1', 'F A1', 'ov_cap_alpha', 'A', 1, 0));
  push(groupTeamEntry('ov_champ_f', 'ov_f_team_2', 'F sem grupo', 'ov_cap_alpha', undefined, undefined, 1, { groupId: null, groupSeed: null }));
  push(groupTeamEntry('ov_champ_f', 'ov_f_team_3', 'F B1', 'ov_cap_beta', 'B', 1, 2));
  push(groupTeamEntry('ov_champ_f', 'ov_f_team_4', 'F grupo invalido', 'ov_cap_beta', 'ZZ', 2, 3, { groupId: 'ZZ' }));
  // Inconsistência 5: partida cross-group. Inconsistência 6: knockout sem originSnapshotVersion.
  push(
    groupMatchEntry('ov_f_cross', 'ov_champ_f', 'A', 'ov_f_team_1', 'ov_f_team_3', 'agendado', 1),
    match('ov_f_ko', 'ov_champ_f', 2, 'ov_f_team_1', 'ov_f_team_3', 'agendado', {
      stage: 'knockout', groupId: null, knockoutRound: 'final', structureVersion: 1, originSnapshotVersion: null, nextMatchId: null,
    }),
  );

  return out;
}

function buildDocs() {
  const entries = [
    user('ov_org_owner', 'Organizador Autorizado', 'organizador'),
    user('ov_org_external', 'Organizador Externo', 'atleta'),
    user('ov_cap_alpha', 'Capitao Alpha', 'capitao', { teamId: 'ov_a_team_1' }),
    user('ov_cap_beta', 'Capitao Beta', 'capitao', { teamId: 'ov_a_team_2' }),
    user('ov_ath_01', 'Atleta Um', 'atleta', { teamId: 'ov_a_team_1' }),
    user('ov_ath_02', 'Atleta Dois', 'atleta', { teamId: 'ov_a_team_1' }),
    user('ov_ath_03', 'Atleta Tres', 'atleta', { teamId: 'ov_a_team_2' }),
    user('ov_ath_04', 'Atleta Quatro', 'atleta', { teamId: 'ov_a_team_2' }),
    user('ov_ath_05', 'Atleta Cinco', 'atleta', { teamId: 'ov_a_team_3' }),
    user('ov_ath_06', 'Atleta Seis', 'atleta', { teamId: 'ov_a_team_3' }),
    user('ov_ath_07', 'Atleta Sete', 'atleta', { teamId: 'ov_a_team_4' }),
    user('ov_ath_08', 'Atleta Oito', 'atleta', { teamId: 'ov_a_team_4' }),
    user('ov_ath_suspended', 'Atleta Suspenso', 'atleta', { teamId: 'ov_a_team_1' }),
    user('ov_ath_injured', 'Atleta Lesionado', 'atleta', { teamId: 'ov_a_team_1' }),
    user('ov_ath_removed', 'Atleta Removido', 'atleta', { teamId: null }),
    user('ov_ath_free', 'Atleta Sem Time', 'atleta', { teamId: null }),
    allowlist('ov_org_owner', true),
    allowlist('ov_org_external', false),
    championship('ov_champ_a', 'Operacional A - Pontos Corridos', 'pontos_corridos', 'em_andamento', 'ov_org_owner', {
      currentRound: 1,
      totalRounds: 3,
      maxTeams: 4,
      registeredTeamsCount: 4,
    }),
    championship('ov_champ_b', 'Operacional B - Mata-mata', 'mata_mata', 'em_andamento', 'ov_org_owner', {
      currentRound: 1,
      totalRounds: 3,
      maxTeams: 6,
      registeredTeamsCount: 6,
    }),
    championship('ov_champ_c', 'Operacional C - Encerrado', 'pontos_corridos', 'finalizado', 'ov_org_owner', {
      currentRound: 3,
      totalRounds: 3,
      maxTeams: 4,
      registeredTeamsCount: 4,
      finishedAt: iso(1),
    }),
  ];

  ['Alpha', 'Beta', 'Gamma', 'Delta'].forEach((name, index) => {
    const id = `ov_a_team_${index + 1}`;
    entries.push(team(id, 'ov_champ_a', `A ${name}`, index < 2 ? `ov_cap_${index === 0 ? 'alpha' : 'beta'}` : 'ov_cap_alpha', index, {
      approvedPlayersCount: index === 0 ? 4 : 2,
      maxPlayers: 5,
    }));
  });

  ['Atlas', 'Boreal', 'Canaa', 'Damasco', 'Eden', 'Farol'].forEach((name, index) => {
    entries.push(team(`ov_b_team_${index + 1}`, 'ov_champ_b', `B ${name}`, index % 2 === 0 ? 'ov_cap_alpha' : 'ov_cap_beta', index, {
      approvedPlayersCount: 2,
    }));
  });

  ['Historico 1', 'Historico 2', 'Historico 3', 'Historico 4'].forEach((name, index) => {
    entries.push(team(`ov_c_team_${index + 1}`, 'ov_champ_c', `C ${name}`, index % 2 === 0 ? 'ov_cap_alpha' : 'ov_cap_beta', index, {
      approvedPlayersCount: 2,
    }));
  });

  const aPlayers = [
    ['ov_a_p1', 'ov_a_team_1', 'ov_ath_01', 'Atleta Um', 9, 'ativo'],
    ['ov_a_p2', 'ov_a_team_1', 'ov_ath_02', 'Atleta Dois', 10, 'ativo'],
    ['ov_a_p3', 'ov_a_team_2', 'ov_ath_03', 'Atleta Tres', 7, 'ativo'],
    ['ov_a_p4', 'ov_a_team_2', 'ov_ath_04', 'Atleta Quatro', 11, 'ativo'],
    ['ov_a_p5', 'ov_a_team_3', 'ov_ath_05', 'Atleta Cinco', 5, 'ativo'],
    ['ov_a_p6', 'ov_a_team_3', 'ov_ath_06', 'Atleta Seis', 8, 'ativo'],
    ['ov_a_p7', 'ov_a_team_4', 'ov_ath_07', 'Atleta Sete', 3, 'ativo'],
    ['ov_a_p8', 'ov_a_team_4', 'ov_ath_08', 'Atleta Oito', 4, 'ativo'],
    ['ov_a_suspended', 'ov_a_team_1', 'ov_ath_suspended', 'Atleta Suspenso', 15, 'suspenso'],
    ['ov_a_injured', 'ov_a_team_1', 'ov_ath_injured', 'Atleta Lesionado', 16, 'lesionado'],
    ['ov_a_removed', 'ov_a_team_1', 'ov_ath_removed', 'Atleta Removido', 17, 'removido'],
    ['ov_a_free', null, 'ov_ath_free', 'Atleta Sem Time', 99, 'sem_time'],
  ];
  for (const [id, teamId, userId, name, number, status] of aPlayers) {
    entries.push(player(id, 'ov_champ_a', teamId, userId, name, number, status));
    if (teamId) {
      const active = status !== 'removido' && status !== 'sem_time';
      entries.push(membership(teamId, userId, 'ov_champ_a', status, active));
    }
  }

  for (let i = 1; i <= 12; i += 1) {
    const teamId = `ov_b_team_${Math.ceil(i / 2)}`;
    const userId = i <= 8 ? `ov_ath_0${i}` : i === 9 ? 'ov_ath_suspended' : i === 10 ? 'ov_ath_injured' : `ov_b_guest_${i}`;
    entries.push(player(`ov_b_p${i}`, 'ov_champ_b', teamId, userId, `Mata-mata ${i}`, i, i === 9 ? 'suspenso' : i === 10 ? 'lesionado' : 'ativo'));
    entries.push(membership(teamId, userId, 'ov_champ_b', i === 9 ? 'suspenso' : i === 10 ? 'lesionado' : 'ativo', true));
  }

  for (let i = 1; i <= 8; i += 1) {
    const teamId = `ov_c_team_${Math.ceil(i / 2)}`;
    entries.push(player(`ov_c_p${i}`, 'ov_champ_c', teamId, `ov_ath_0${((i - 1) % 8) + 1}`, `Historico ${i}`, i, 'ativo'));
  }

  entries.push(
    match('ov_a_match_scheduled', 'ov_champ_a', 1, 'ov_a_team_1', 'ov_a_team_2', 'agendado'),
    match('ov_a_match_finalized', 'ov_champ_a', 1, 'ov_a_team_1', 'ov_a_team_2', 'finalizado', {
      homeScore: 2,
      awayScore: 1,
      winnerId: 'ov_a_team_1',
      finishedAt: iso(2, '21:30:00'),
    }),
    match('ov_a_match_postponed', 'ov_champ_a', 1, 'ov_a_team_3', 'ov_a_team_4', 'adiado', {
      scheduledAt: iso(12, '20:00:00'),
      statusVersion: 1,
      lastStatusChangeId: 'ov_chg_postponed',
    }),
    match('ov_a_match_cancelled', 'ov_champ_a', 2, 'ov_a_team_1', 'ov_a_team_3', 'cancelado', {
      statusVersion: 1,
      lastStatusChangeId: 'ov_chg_cancelled',
    }),
    match('ov_a_match_wo', 'ov_champ_a', 2, 'ov_a_team_2', 'ov_a_team_4', 'wo', {
      homeScore: 3,
      awayScore: 0,
      winnerId: 'ov_a_team_2',
      statusVersion: 1,
      lastStatusChangeId: 'ov_chg_wo',
    }),
    match('ov_a_match_convocation', 'ov_champ_a', 2, 'ov_a_team_1', 'ov_a_team_4', 'agendado'),
  );

  entries.push(
    event('ov_ev_a_goal_1', 'ov_a_match_finalized', 'ov_champ_a', 'gol', 'ov_a_team_1', 'ov_a_p1', 12, { playerName: 'Atleta Um', teamName: 'A Alpha' }),
    event('ov_ev_a_assist_1', 'ov_a_match_finalized', 'ov_champ_a', 'assistencia', 'ov_a_team_1', 'ov_a_p2', 12, { playerName: 'Atleta Dois', teamName: 'A Alpha' }),
    event('ov_ev_a_goal_2', 'ov_a_match_finalized', 'ov_champ_a', 'gol', 'ov_a_team_1', 'ov_a_p2', 61, { playerName: 'Atleta Dois', teamName: 'A Alpha' }),
    event('ov_ev_a_goal_3', 'ov_a_match_finalized', 'ov_champ_a', 'gol', 'ov_a_team_2', 'ov_a_p3', 73, { playerName: 'Atleta Tres', teamName: 'A Beta' }),
    event('ov_ev_a_yellow', 'ov_a_match_finalized', 'ov_champ_a', 'cartao_amarelo', 'ov_a_team_1', 'ov_a_suspended', 80, { playerName: 'Atleta Suspenso', teamName: 'A Alpha' }),
  );

  entries.push(
    statusChange('ov_chg_postponed', 'ov_a_match_postponed', 'ov_champ_a', 'adiamento', 'agendado', 'adiado', 'ov_org_owner'),
    statusChange('ov_chg_cancelled', 'ov_a_match_cancelled', 'ov_champ_a', 'cancelamento', 'agendado', 'cancelado', 'ov_org_owner'),
    statusChange('ov_chg_wo', 'ov_a_match_wo', 'ov_champ_a', 'wo', 'agendado', 'wo', 'ov_org_owner', {
      afterScore: { homeScore: 3, awayScore: 0 },
      winnerId: 'ov_a_team_2',
      derivedEffects: ['status', 'placar', 'classificacao', 'vencedor', 'encerra_convocacao'],
    }),
  );

  entries.push(
    convocation('ov_a_match_convocation', 'ov_a_team_1', 'ov_champ_a', 'ov_cap_alpha', ['ov_a_p1', 'ov_a_p2', 'ov_a_suspended', 'ov_a_injured']),
    attendance('ov_a_match_convocation', 'ov_a_p1', 'ov_champ_a', 'ov_a_team_1', 'ov_ath_01', 'confirmed'),
    attendance('ov_a_match_convocation', 'ov_a_p2', 'ov_champ_a', 'ov_a_team_1', 'ov_ath_02', 'declined'),
    attendance('ov_a_match_convocation', 'ov_a_suspended', 'ov_champ_a', 'ov_a_team_1', 'ov_ath_suspended', 'pending'),
  );

  entries.push(
    match('ov_b_q1_correctable', 'ov_champ_b', 1, 'ov_b_team_3', 'ov_b_team_4', 'finalizado', {
      homeScore: 1,
      awayScore: 0,
      winnerId: 'ov_b_team_3',
      nextMatchId: 'ov_b_sf1_scheduled',
      bracketRound: 'quartas',
      bracketPosition: 0,
      finishedAt: iso(2),
    }),
    match('ov_b_q2_scheduled', 'ov_champ_b', 1, 'ov_b_team_5', 'ov_b_team_6', 'agendado', {
      nextMatchId: 'ov_b_sf2_live',
      bracketRound: 'quartas',
      bracketPosition: 1,
    }),
    match('ov_b_q3_locked', 'ov_champ_b', 1, 'ov_b_team_1', 'ov_b_team_2', 'finalizado', {
      homeScore: 2,
      awayScore: 1,
      winnerId: 'ov_b_team_1',
      nextMatchId: 'ov_b_sf2_live',
      bracketRound: 'quartas',
      bracketPosition: 2,
      finishedAt: iso(2),
    }),
    match('ov_b_sf1_scheduled', 'ov_champ_b', 2, 'ov_b_team_3', 'ov_b_team_1', 'agendado', {
      nextMatchId: 'ov_b_final',
      bracketRound: 'semi',
      bracketPosition: 0,
    }),
    match('ov_b_sf2_live', 'ov_champ_b', 2, 'ov_b_team_5', 'ov_b_team_2', 'ao_vivo', {
      homeScore: 0,
      awayScore: 0,
      nextMatchId: 'ov_b_final',
      bracketRound: 'semi',
      bracketPosition: 1,
    }),
    match('ov_b_final', 'ov_champ_b', 3, 'ov_b_team_1', 'ov_b_team_2', 'agendado', {
      bracketRound: 'final',
      bracketPosition: 0,
    }),
  );

  entries.push(
    event('ov_ev_b_goal_1', 'ov_b_q1_correctable', 'ov_champ_b', 'gol', 'ov_b_team_3', 'ov_b_p5', 34),
    event('ov_ev_b_yellow', 'ov_b_q1_correctable', 'ov_champ_b', 'cartao_amarelo', 'ov_b_team_4', 'ov_b_p7', 56),
    [`match_corrections/ov_corr_existing`, {
      id: 'ov_corr_existing',
      championshipId: 'ov_champ_b',
      matchId: 'ov_b_q1_correctable',
      organizerId: 'ov_org_owner',
      reason: 'Seed operacional: correcao previa para historico',
      createdAt: iso(2),
      previousScore: { homeScore: 0, awayScore: 0 },
      newScore: { homeScore: 1, awayScore: 0 },
      previousWinnerId: null,
      newWinnerId: 'ov_b_team_3',
      eventsAdded: [],
      eventsRemoved: [],
      eventsChanged: [],
      round: 1,
      championshipFormat: 'mata_mata',
      derivedEffects: ['placar', 'eventos', 'mata_mata'],
      previousMatchVersion: 0,
      newMatchVersion: 1,
      previousMatch: { id: 'ov_b_q1_correctable', championshipId: 'ov_champ_b', round: 1, homeTeamId: 'ov_b_team_3', awayTeamId: 'ov_b_team_4', homeScore: 0, awayScore: 0, status: 'finalizado' },
    }],
  );

  entries.push(
    match('ov_c_match_finalized', 'ov_champ_c', 3, 'ov_c_team_1', 'ov_c_team_2', 'finalizado', {
      homeScore: 3,
      awayScore: 2,
      winnerId: 'ov_c_team_1',
      finishedAt: iso(1),
    }),
    [`championship_results/ov_champ_c`, {
      id: 'ov_champ_c',
      championshipId: 'ov_champ_c',
      championshipName: 'Operacional C - Encerrado',
      season: '2026',
      format: 'pontos_corridos',
      totalTeams: 4,
      totalPlayers: 8,
      totalMatches: 6,
      totalGoals: 18,
      winnerId: 'ov_c_team_1',
      winnerName: 'C Historico 1',
      runnerUpId: 'ov_c_team_2',
      runnerUpName: 'C Historico 2',
      topScorerId: 'ov_c_p1',
      topScorerName: 'Historico 1',
      topScorerGoals: 6,
      bestDefenseId: 'ov_c_team_1',
      bestDefenseName: 'C Historico 1',
      bestDefenseGoals: 2,
      finishedAt: iso(1),
      organizerId: 'ov_org_owner',
    }],
    [`player_history/ov_ath_01_ov_champ_c`, {
      id: 'ov_ath_01_ov_champ_c',
      userId: 'ov_ath_01',
      championshipId: 'ov_champ_c',
      championshipName: 'Operacional C - Encerrado',
      teamId: 'ov_c_team_1',
      teamName: 'C Historico 1',
      season: '2026',
      goals: 6,
      assists: 2,
      yellowCards: 1,
      redCards: 0,
      matchesPlayed: 3,
      overall: 88,
      finishedAt: iso(1),
      position: 'atacante',
      isChampion: true,
      isMvp: true,
      roundMvpCount: 1,
    }],
    [`career_stats/ov_ath_01`, {
      userId: 'ov_ath_01',
      name: 'Atleta Um',
      lastTeamName: 'C Historico 1',
      totalGoals: 6,
      totalAssists: 2,
      totalMatches: 3,
      totalTitles: 1,
      totalMvps: 1,
      totalChampionships: 1,
      bestOverall: 88,
      bestSeason: '2026',
      bestSeasonGoals: 6,
      firstSeasonYear: '2026',
      updatedAt: iso(1),
    }],
    [`all_time_rankings/global`, {
      players: [{ userId: 'ov_ath_01', name: 'Atleta Um', teamName: 'C Historico 1', goals: 6, titles: 1, matches: 3, mvps: 1, seasons: 1 }],
      teams: [{ teamId: 'ov_c_team_1', name: 'C Historico 1', titles: 1, participations: 1 }],
    }],
  );

  entries.push(
    [`round_awards/ov_champ_a_1`, {
      id: 'ov_champ_a_1',
      championshipId: 'ov_champ_a',
      round: 1,
      winnerPlayerId: 'ov_a_p1',
      winnerName: 'Atleta Um',
      winnerTeamId: 'ov_a_team_1',
      totalVotes: 5,
      closedAt: iso(2),
    }],
  );

  for (const pair of notification('ov_notif_convocation', 'ov_ath_01', 'convocation_received', 'Voce foi convocado', 'A Alpha convocou voce para a partida.', { matchId: 'ov_a_match_convocation' })) entries.push(pair);
  for (const pair of notification('ov_notif_att_confirmed', 'ov_cap_alpha', 'attendance_confirmed', 'Presenca confirmada', 'Atleta Um confirmou presenca.', { matchId: 'ov_a_match_convocation' })) entries.push(pair);
  for (const pair of notification('ov_notif_att_declined', 'ov_cap_alpha', 'attendance_declined', 'Presenca recusada', 'Atleta Dois recusou presenca.', { matchId: 'ov_a_match_convocation' })) entries.push(pair);
  for (const pair of notification('ov_notif_reconfirm', 'ov_ath_01', 'reconfirmation_required', 'Reconfirme sua presenca', 'A partida foi adiada.', { matchId: 'ov_a_match_postponed' })) entries.push(pair);
  for (const pair of notification('ov_notif_cancelled', 'ov_ath_03', 'match_cancelled', 'Partida cancelada', 'A partida foi cancelada pelo organizador.', { matchId: 'ov_a_match_cancelled' })) entries.push(pair);
  for (const pair of notification('ov_notif_wo', 'ov_ath_04', 'match_wo', 'W.O. registrado', 'Resultado administrativo registrado.', { matchId: 'ov_a_match_wo' })) entries.push(pair);

  // Bloco 10.5 — campeonatos do formato grupos + mata-mata (D/E/F).
  for (const pair of buildGroupsDocs()) entries.push(pair);

  return Object.fromEntries(entries);
}

function uniqueDocs(docs) {
  return Object.entries(docs).filter(([path]) => {
    const id = path.split('/').pop();
    // Inclui docs cujo ID determinístico não começa com ov_ mas pertencem ao
    // dataset operacional (ex.: group_stage_snapshots/champ__ov_champ_e__...).
    return id === 'global' || id.startsWith(PREFIX) || path.includes(PREFIX);
  });
}

async function commitInChunks(db, operations, action) {
  let batch = db.batch();
  let count = 0;
  for (const [path, data] of operations) {
    const ref = db.doc(path);
    if (action === 'delete') batch.delete(ref);
    else batch.set(ref, data, { merge: false });
    count += 1;
    if (count % 450 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  await batch.commit();
  return count;
}

function summarize(docs) {
  return Object.keys(docs).reduce((acc, path) => {
    const collection = path.split('/')[0];
    acc[collection] = (acc[collection] || 0) + 1;
    return acc;
  }, {});
}

async function seedAuthUsers(environment) {
  if (!environment.authEmulator) {
    throw new Error('Para --seed-auth, defina FIREBASE_AUTH_EMULATOR_HOST e inicie o Auth Emulator.');
  }
  const auth = getFirebaseAuth();
  const users = Object.values(buildDocs())
    .filter((doc) => doc && doc.email && doc.id && doc.id.startsWith(PREFIX))
    .map((doc) => ({ uid: doc.id, email: doc.email, displayName: doc.name, password: TEST_USER_PASSWORD }));

  let created = 0;
  let updated = 0;
  for (const item of users) {
    try {
      await auth.createUser(item);
      created += 1;
    } catch (error) {
      if (error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error;
      await auth.updateUser(item.uid, { email: item.email, displayName: item.displayName, password: item.password });
      updated += 1;
    }
  }
  return { created, updated };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const environment = assertSafeTarget(getProjectId(args));
  const db = initialize(environment.projectId);
  const docs = buildDocs();
  const operations = uniqueDocs(docs);

  console.log(`[seed:operational] projeto=${environment.projectId}`);
  console.log(`[seed:operational] firestoreEmulator=${environment.firestoreEmulator || 'nao'}`);
  console.log(`[seed:operational] authEmulator=${environment.authEmulator || 'nao'}`);
  console.log(`[seed:operational] reset=${args.reset ? 'sim' : 'nao'}`);

  if (args.reset) {
    const deleted = await commitInChunks(db, operations, 'delete');
    console.log(`[seed:operational] reset removeu ${deleted} documentos determinicos.`);
  }

  const written = await commitInChunks(db, operations, 'set');
  console.log(`[seed:operational] documentos gravados=${written}`);
  console.log(`[seed:operational] resumo=${JSON.stringify(summarize(docs))}`);

  if (args.seedAuth) {
    const authResult = await seedAuthUsers(environment);
    console.log(`[seed:operational] auth criado=${authResult.created} atualizado=${authResult.updated}`);
    console.log('[seed:operational] auth seed concluido; senha de teste nao registrada no log.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[seed:operational] falha:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { buildDocs, assertSafeTarget, parseArgs, seedAuthUsers };
