const {
  auditLegacyData,
  buildBackfillPlan,
  MIGRATION_VERSION,
} = require('../migration/legacyDataCore');

function baseDataset() {
  return {
    users: [
      { id: 'u1', name: 'A', role: 'atleta' },
      { id: 'u2', name: 'B', role: 'atleta' },
      { id: 'cap1', name: 'Cap', role: 'capitao' },
    ],
    championships: [
      {
        id: 'champ1',
        name: 'Champ',
        status: 'inscricoes_abertas',
        format: 'pontos_corridos',
        currentRound: 1,
        totalRounds: 1,
        organizerId: 'org',
        rules: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: [], fairPlay: true, craqueDaRodada: true },
        registeredTeamsCount: 3,
        maxTeams: 3,
      },
    ],
    teams: [
      { id: 'team1', championshipId: 'champ1', name: 'T1', captainId: 'cap1', status: 'aprovado', approvedPlayersCount: 0, maxPlayers: 3 },
      { id: 'team2', championshipId: 'champ1', name: 'T2', captainId: 'missing', status: 'aprovado', approvedPlayersCount: 1, maxPlayers: 3 },
      { id: 'rejected', championshipId: 'champ1', name: 'RJ', captainId: 'cap1', status: 'rejeitado', approvedPlayersCount: 0, maxPlayers: 3 },
    ],
    players: [
      { id: 'p1', teamId: 'team1', championshipId: 'champ1', userId: 'u1', name: 'A', position: 'meia', number: 10, status: 'ativo' },
      { id: 'p2', teamId: 'team1', championshipId: 'champ1', userId: 'u2', name: 'B', position: 'meia', number: 10, status: 'ativo' },
      { id: 'p2b', teamId: 'team2', championshipId: 'champ1', userId: 'u2', name: 'B', position: 'meia', number: 8, status: 'ativo' },
    ],
    team_memberships: [
      { id: 'ghost_u9', teamId: 'ghost', championshipId: 'champ1', userId: 'u9', playerId: 'missing', status: 'ativo' },
    ],
    matches: [
      { id: 'm1', championshipId: 'champ1', round: 1, homeTeamId: 'team1', awayTeamId: 'team2', homeScore: 0, awayScore: 0, status: 'agendado' },
      { id: 'm2', championshipId: 'champ1', round: 1, homeTeamId: 'team1', awayTeamId: 'rejected', homeScore: 0, awayScore: 0, status: 'agendado' },
      { id: 'wo-bad', championshipId: 'champ1', round: 2, homeTeamId: 'team1', awayTeamId: 'team2', homeScore: 2, awayScore: 0, status: 'wo' },
    ],
    match_events: [{ id: 'e1', matchId: 'wo-bad', championshipId: 'champ1', teamId: 'team1', playerId: 'p1', type: 'gol' }],
    match_convocations: [],
    match_attendance: [{ id: 'm1_p2', championshipId: 'champ1', matchId: 'm1', teamId: 'team1', playerId: 'p2', userId: 'u2', response: 'confirmed', version: 1 }],
    round_awards: [
      { id: 'legacy-auto', championshipId: 'champ1', round: 1, winnerPlayerId: 'p1', winnerName: 'A', winnerTeamId: 'team1', totalVotes: 1 },
      { id: 'champ1_1', championshipId: 'champ1', round: 1, winnerPlayerId: 'p2', winnerName: 'B', winnerTeamId: 'team1', totalVotes: 2 },
    ],
    championship_results: [{ id: 'champ1', championshipId: 'champ1', totalTeams: 99, winnerId: 'ghost' }],
    career_stats: [],
    player_history: [],
    all_time_rankings: [],
    organizer_allowlist: [],
    match_status_changes: [],
    match_corrections: [],
    achievements: [],
    legacyConvocations: [
      { id: '1', round: 1, teamId: 'team1', path: 'teams/team1/convocations/1', playerIds: ['p1'] },
      { id: '2', round: 2, teamId: 'team2', path: 'teams/team2/convocations/2', playerIds: ['p2b'] },
    ],
  };
}

describe('Block 6 legacy data audit', () => {
  it('detecta memberships ausentes, orfaos, contador errado, player duplicado, capitao invalido, convocacao ambigua, award duplicado e match inconsistente', () => {
    const report = auditLegacyData(baseDataset(), { projectId: 'test', environment: 'unit' });

    expect(report.categories['team-memberships'].issues.some((issue) => issue.message.includes('sem team_memberships'))).toBe(true);
    expect(report.categories['team-memberships'].issues.some((issue) => issue.conflicts.includes('team_inexistente'))).toBe(true);
    expect(report.categories['approved-player-counts'].issues.some((issue) => issue.message.includes('divergente'))).toBe(true);
    expect(report.categories['approved-player-counts'].issues.some((issue) => issue.conflicts.includes('player_em_dois_times'))).toBe(true);
    expect(report.categories.captains.issues.some((issue) => issue.conflicts.includes('captain_user_inexistente'))).toBe(true);
    expect(report.categories['legacy-convocations'].issues.some((issue) => issue.conflicts.includes('convocacao_ambigua'))).toBe(true);
    expect(report.categories['round-awards'].issues.some((issue) => issue.conflicts.includes('vencedores_conflitantes'))).toBe(true);
    expect(report.categories.matches.issues.some((issue) => issue.conflicts.includes('wo_sem_resultSource'))).toBe(true);
  });

  it('dry-run gera plano sem aplicar e respeita limite', () => {
    const report = auditLegacyData(baseDataset(), { projectId: 'test', environment: 'unit', limit: 2 });

    expect(report.mode).toBe('dry-run');
    expect(report.proposedChanges.length).toBeLessThanOrEqual(2);
    expect(report.totalDocuments).toBeGreaterThan(0);
  });

  it('planeja apply seguro para membership, contadores e convocacao nao ambigua', () => {
    const dataset = baseDataset();
    dataset.players = dataset.players.filter((player) => player.id !== 'p2b');
    dataset.players.find((player) => player.id === 'p2').number = 11;
    dataset.teams[0].approvedPlayersCount = 1;
    dataset.championships[0].registeredTeamsCount = 99;
    dataset.legacyConvocations = [
      { id: '2', round: 2, teamId: 'team2', path: 'teams/team2/convocations/2', playerIds: [] },
    ];
    const report = auditLegacyData(dataset, { projectId: 'test', environment: 'unit' });
    const plan = buildBackfillPlan(dataset, report, { now: '2026-01-01T00:00:00.000Z' });

    expect(plan.changes.some((change) => change.category === 'team-memberships' && change.after.createdByMigration)).toBe(true);
    expect(plan.changes.some((change) => change.category === 'approved-player-counts')).toBe(true);
    expect(plan.changes.some((change) => change.category === 'registered-team-counts')).toBe(true);
    expect(plan.changes.some((change) => change.category === 'legacy-convocations' && change.after.migratedFromLegacy)).toBe(true);
    expect(plan.changes.every((change) => change.migrationVersion === MIGRATION_VERSION)).toBe(true);
  });

  it('segunda execucao depois do plano fica idempotente para os documentos criados', () => {
    const dataset = baseDataset();
    dataset.players = [dataset.players[0]];
    dataset.teams = [dataset.teams[0]];
    dataset.championships[0].registeredTeamsCount = 1;
    dataset.legacyConvocations = [];
    const firstReport = auditLegacyData(dataset, { projectId: 'test', environment: 'unit' });
    const firstPlan = buildBackfillPlan(dataset, firstReport, { now: '2026-01-01T00:00:00.000Z' });

    const membership = firstPlan.changes.find((change) => change.category === 'team-memberships');
    dataset.team_memberships.push({ id: membership.id, ...membership.after });
    dataset.teams[0].approvedPlayersCount = 1;

    const secondReport = auditLegacyData(dataset, { projectId: 'test', environment: 'unit' });
    const secondPlan = buildBackfillPlan(dataset, secondReport, { now: '2026-01-01T00:00:00.000Z' });

    expect(secondPlan.changes).toHaveLength(0);
  });

  it('recusa corrigir conflito manual automaticamente', () => {
    const report = auditLegacyData(baseDataset(), { projectId: 'test', environment: 'unit' });

    expect(report.proposedChanges.some((change) => change.id === 'team1' && change.category === 'approved-player-counts')).toBe(false);
    expect(report.categories['legacy-convocations'].issues.find((issue) => issue.conflicts.includes('convocacao_ambigua')).autoFixable).toBe(false);
  });
});

describe('Bloco 10.5 - auditoria do formato grupos + mata-mata', () => {
  function groupsChampion(over = {}) {
    return {
      id: 'champD',
      name: 'Copa Grupos',
      status: 'em_andamento',
      format: 'grupos_e_mata_mata',
      currentRound: 1,
      totalRounds: 3,
      organizerId: 'org',
      rules: { pointsWin: 3, pointsDraw: 1, pointsLoss: 0, tiebreakers: [], fairPlay: true, craqueDaRodada: true },
      groupStageConfig: { version: 1, groupCount: 2, qualifiersPerGroup: 1, includeBestThirdPlaced: false, bestThirdPlacedCount: 0, drawMethod: 'random' },
      groupStageStatus: 'fixtures_generated',
      knockoutStageStatus: 'not_generated',
      groupGenerationVersion: 1,
      groupFixturesVersion: 1,
      groupStructureVersion: 1,
      stage: 'group_stage',
      ...over,
    };
  }
  function groupsTeam(id, group, seed, over = {}) {
    return {
      id, championshipId: 'champD', name: id, captainId: `cap-${id}`, status: 'aprovado',
      approvedPlayersCount: 0, maxPlayers: 15, groupId: group, groupSeed: seed, groupAssignmentVersion: 1, ...over,
    };
  }
  function groupMatch(id, home, away, over = {}) {
    return {
      id, championshipId: 'champD', stage: 'group', groupId: 'A', groupRound: 1, round: 1,
      homeTeamId: home, awayTeamId: away, homeScore: null, awayScore: null, status: 'agendado', ...over,
    };
  }
  function datasetWith(over = {}) {
    return {
      users: [{ id: 'org', role: 'organizador' }],
      championships: [over.championship || groupsChampion()],
      teams: over.teams || [
        groupsTeam('A', 'A', 1), groupsTeam('B', 'A', 2),
        groupsTeam('C', 'B', 1), groupsTeam('D', 'B', 2),
      ],
      players: [],
      team_memberships: [],
      matches: over.matches || [
        groupMatch('ga', 'A', 'B', { groupId: 'A', status: 'finalizado', homeScore: 1, awayScore: 0 }),
        groupMatch('gb', 'C', 'D', { groupId: 'B', status: 'finalizado', homeScore: 2, awayScore: 1 }),
      ],
      match_events: [],
      match_convocations: [],
      match_attendance: [],
      round_awards: [],
      championship_results: [],
      career_stats: [],
      player_history: [],
      all_time_rankings: [],
      organizer_allowlist: [],
      match_status_changes: [],
      match_corrections: [],
      achievements: [],
      group_assignment_logs: over.group_assignment_logs || [],
      group_fixture_logs: over.group_fixture_logs || [],
      group_stage_snapshots: over.group_stage_snapshots || [],
      group_transition_logs: over.group_transition_logs || [],
      legacyConvocations: [],
    };
  }
  const conflictsOf = (report) =>
    report.categories.groups.issues.flatMap((i) => i.conflicts || []);

  it('um dataset D coerente nao gera conflitos estruturais de grupos', () => {
    const report = auditLegacyData(datasetWith(), { projectId: 'test', environment: 'unit' });
    expect(report.categories.groups).toBeDefined();
    expect(conflictsOf(report)).toEqual([]);
  });

  it('detecta config ausente e groupCount invalido', () => {
    const noConfig = auditLegacyData(datasetWith({ championship: groupsChampion({ groupStageConfig: undefined }) }), {});
    expect(conflictsOf(noConfig)).toContain('group_config_ausente');
    const badCount = auditLegacyData(
      datasetWith({ championship: groupsChampion({ groupStageConfig: { version: 1, groupCount: 3, qualifiersPerGroup: 1 } }) }),
      {},
    );
    expect(conflictsOf(badCount)).toContain('group_count_invalido');
  });

  it('detecta time sem grupo e groupId invalido apos sorteio', () => {
    const report = auditLegacyData(
      datasetWith({ teams: [
        groupsTeam('A', 'A', 1), groupsTeam('B', null, 2),
        groupsTeam('C', 'B', 1), groupsTeam('D', 'ZZ', 2),
      ] }),
      {},
    );
    const c = conflictsOf(report);
    expect(c).toContain('time_sem_grupo');
    expect(c).toContain('group_id_invalido');
  });

  it('detecta partida cross-group e duplicada', () => {
    const report = auditLegacyData(
      datasetWith({ matches: [
        groupMatch('x1', 'A', 'C', { groupId: 'A' }),
        groupMatch('x2', 'A', 'B', { groupId: 'A' }),
        groupMatch('x3', 'A', 'B', { groupId: 'A' }),
      ] }),
      {},
    );
    const c = conflictsOf(report);
    expect(c).toContain('partida_cross_group');
    expect(c).toContain('fixture_duplicada');
  });

  it('detecta fixtures parciais (menos partidas que o esperado)', () => {
    const report = auditLegacyData(
      datasetWith({ matches: [groupMatch('ga', 'A', 'B', { groupId: 'A', status: 'finalizado', homeScore: 1, awayScore: 0 })] }),
      {},
    );
    expect(conflictsOf(report)).toContain('fixtures_parciais');
  });

  it('detecta mata-mata gerado sem snapshot (CRITICAL)', () => {
    const report = auditLegacyData(
      datasetWith({
        championship: groupsChampion({ knockoutStageStatus: 'generated', knockoutGenerationVersion: 1, stage: 'knockout', groupStageStatus: 'completed' }),
        matches: [
          groupMatch('k1', 'A', 'C', { stage: 'knockout', groupId: null, status: 'agendado', originSnapshotVersion: null }),
        ],
      }),
      {},
    );
    const c = conflictsOf(report);
    expect(c).toContain('snapshot_ausente');
    expect(c).toContain('knockout_sem_origin_snapshot');
    expect(c).toContain('group_stage_locked_at_ausente');
    const critical = report.categories.groups.issues.find((i) => i.conflicts.includes('snapshot_ausente'));
    expect(critical.severity).toBe('CRITICAL');
  });

  it('detecta W.O. de grupo inconsistente', () => {
    const report = auditLegacyData(
      datasetWith({ matches: [
        groupMatch('ga', 'A', 'B', { groupId: 'A', status: 'wo', homeScore: 2, awayScore: 0 }),
        groupMatch('gb', 'C', 'D', { groupId: 'B', status: 'finalizado', homeScore: 1, awayScore: 0 }),
      ] }),
      {},
    );
    expect(conflictsOf(report)).toContain('wo_inconsistente');
  });

  it('nao converte formato antigo e faz auto-fix conservador so de stage', () => {
    const report = auditLegacyData(
      datasetWith({ championship: groupsChampion({ stage: undefined }) }),
      {},
    );
    const change = report.proposedChanges.find((c) => c.category === 'groups');
    expect(change).toBeDefined();
    expect(change.after).toEqual({ stage: 'group_stage' });
    for (const c of report.proposedChanges) {
      if (c.category === 'groups') expect(Object.keys(c.after)).toEqual(['stage']);
    }
  });

  it('auto-fix de stage e idempotente na segunda execucao', () => {
    const dataset = datasetWith({ championship: groupsChampion({ stage: undefined }) });
    const report = auditLegacyData(dataset, {});
    const change = report.proposedChanges.find((c) => c.category === 'groups');
    dataset.championships[0].stage = change.after.stage;
    const second = auditLegacyData(dataset, {});
    expect(second.proposedChanges.some((c) => c.category === 'groups')).toBe(false);
  });

  it('legado pontos_corridos e mata_mata simples nao entram na auditoria de grupos', () => {
    const dataset = datasetWith({ championship: { ...groupsChampion(), format: 'pontos_corridos', groupStageConfig: undefined } });
    const report = auditLegacyData(dataset, {});
    expect(report.categories.groups.total).toBe(0);
  });
});
