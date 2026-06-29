/**
 * Garantias do dataset da demo (modo mock P2):
 *  - volume mínimo por collection (3+ campeonatos, players em todos os status,
 *    partidas nos 3 status, artilharia, votação, histórico, rankings);
 *  - coerência interna (placar bate com eventos de gol, approvedPlayersCount
 *    bate com o elenco ativo, voto nunca vai para o próprio time);
 *  - modo mock não toca o Firebase nos fluxos de leitura/escrita genéricos.
 */
import {
  mockAchievements,
  mockAllTimeRankings,
  mockAnnouncements,
  mockChampionships,
  mockCareerStats,
  mockCollections,
  mockJoinRequests,
  mockLeoesConvocations,
  mockMatchEvents,
  mockMatches,
  mockNotifications,
  mockPlayerHistory,
  mockPlayers,
  mockRoundAwards,
  mockRoundVotes,
  mockTeamInvites,
  mockTeams,
  mockUsers,
} from '../mocks/mockData';
import { isActiveRosterPlayer } from '../utils/teamRules';
import { MatchModel, Player } from '../types';

jest.mock('../config/appConfig', () => ({
  USE_MOCK: true,
  MOCK_DATA_ENABLED: true,
  MOCK_ACTIVE_USER: 'organizador',
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
}));

describe('mockData — volume mínimo da demo', () => {
  it('tem pelo menos 3 campeonatos cobrindo os 3 status reais', () => {
    expect(mockChampionships.length).toBeGreaterThanOrEqual(3);
    const statuses = new Set(mockChampionships.map((c) => c.status));
    expect(statuses).toContain('inscricoes_abertas');
    expect(statuses).toContain('em_andamento');
    expect(statuses).toContain('finalizado');
    // Caso extremo: inscrições encerradas manualmente antes do prazo
    expect(mockChampionships.some((c) => c.registrationsClosed === true)).toBe(true);
    // Caso extremo: deadline futura em campeonato aberto
    expect(
      mockChampionships.some(
        (c) =>
          c.status === 'inscricoes_abertas' &&
          !c.registrationsClosed &&
          c.registrationDeadline != null &&
          new Date(c.registrationDeadline).getTime() > Date.now(),
      ),
    ).toBe(true);
  });

  it('tem players com todos os status reais', () => {
    expect(mockPlayers.length).toBeGreaterThanOrEqual(24);
    const statuses = new Set(mockPlayers.map((p) => p.status));
    for (const status of ['ativo', 'suspenso', 'lesionado', 'sem_time', 'removido']) {
      expect(statuses).toContain(status);
    }
    expect(mockPlayers.some((p) => p.guestPlayer === true)).toBe(true);
  });

  it('tem partidas nos 3 status reais', () => {
    expect(mockMatches.length).toBeGreaterThanOrEqual(10);
    const statuses = new Set(mockMatches.map((m) => m.status));
    expect(statuses).toContain('finalizado');
    expect(statuses).toContain('ao_vivo');
    expect(statuses).toContain('agendado');
  });

  it('tem eventos suficientes para a artilharia, com snapshots preservados', () => {
    const goals = mockMatchEvents.filter((e) => e.type === 'gol');
    expect(goals.length).toBeGreaterThanOrEqual(12);
    expect(new Set(goals.map((e) => e.playerId)).size).toBeGreaterThanOrEqual(5);
    for (const event of mockMatchEvents) {
      expect(event.playerName).toBeTruthy();
      expect(event.teamName).toBeTruthy();
    }
    // Hat-trick: algum jogador com 3+ gols na mesma partida
    const byPlayerMatch: Record<string, number> = {};
    for (const g of goals) {
      byPlayerMatch[`${g.matchId}:${g.playerId}`] =
        (byPlayerMatch[`${g.matchId}:${g.playerId}`] ?? 0) + 1;
    }
    expect(Math.max(...Object.values(byPlayerMatch))).toBeGreaterThanOrEqual(3);
    // Cartão vermelho presente
    expect(mockMatchEvents.some((e) => e.type === 'cartao_vermelho')).toBe(true);
    // Jogador removido/sem_time com gol histórico preservado
    const inactiveIds = new Set(
      mockPlayers.filter((p) => !isActiveRosterPlayer(p)).map((p) => p.id),
    );
    expect(goals.some((g) => inactiveIds.has(g.playerId))).toBe(true);
  });

  it('tem dados de votação e award (encerrada E aberta)', () => {
    const champ = 'champ-copa-2026';
    const round1Votes = mockRoundVotes.filter((v) => v.championshipId === champ && v.round === 1);
    const round2Votes = mockRoundVotes.filter((v) => v.championshipId === champ && v.round === 2);
    expect(round1Votes.length).toBeGreaterThanOrEqual(6);
    expect(round2Votes.length).toBeGreaterThanOrEqual(1);

    // Rodada 1: encerrada com award coerente com a apuração
    const award = mockRoundAwards.find((a) => a.championshipId === champ && a.round === 1);
    expect(award).toBeDefined();
    expect(award!.totalVotes).toBe(round1Votes.length);
    const tally: Record<string, number> = {};
    for (const v of round1Votes) tally[v.candidatePlayerId] = (tally[v.candidatePlayerId] ?? 0) + 1;
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
    expect(award!.winnerPlayerId).toBe(top);

    // Rodada 2: completa (todas finalizadas) e SEM award → votação aberta
    const round2Matches = mockMatches.filter((m) => m.championshipId === champ && m.round === 2);
    expect(round2Matches.length).toBeGreaterThan(0);
    expect(round2Matches.every((m) => m.status === 'finalizado')).toBe(true);
    expect(mockRoundAwards.some((a) => a.championshipId === champ && a.round === 2)).toBe(false);
    // Nenhum usuário logável votou na rodada 2 (qualquer perfil da demo pode votar)
    const loggableIds = new Set(Object.values(mockUsers).map((u) => u.id));
    expect(round2Votes.some((v) => loggableIds.has(v.voterId))).toBe(false);
  });

  it('nenhum voto vai para jogador do próprio time do votante', () => {
    for (const vote of mockRoundVotes) {
      const candidate = mockPlayers.find((p) => p.id === vote.candidatePlayerId);
      expect(candidate).toBeDefined();
      // Candidato precisa ter marcado gol na rodada votada
      const roundMatchIds = new Set(
        mockMatches
          .filter((m) => m.championshipId === vote.championshipId && m.round === vote.round)
          .map((m) => m.id),
      );
      expect(
        mockMatchEvents.some(
          (e) => e.type === 'gol' && e.playerId === candidate!.id && roundMatchIds.has(e.matchId),
        ),
      ).toBe(true);
      // Vínculo ativo do votante (se houver) não pode coincidir com o time do candidato
      const voterTeamId = mockPlayers.find(
        (p) =>
          p.userId === vote.voterId &&
          p.championshipId === vote.championshipId &&
          isActiveRosterPlayer(p),
      )?.teamId;
      if (voterTeamId) expect(voterTeamId).not.toBe(candidate!.teamId);
    }
  });

  it('tem dados de histórico, carreira, rankings e conquistas', () => {
    expect(mockPlayerHistory.length).toBeGreaterThanOrEqual(8);
    expect(mockCareerStats.length).toBeGreaterThanOrEqual(4);
    const rankingIds = new Set(mockAllTimeRankings.map((r) => r.id));
    for (const category of ['scorers', 'titles', 'matches', 'mvps', 'teams']) {
      expect(rankingIds).toContain(category);
    }
    expect(mockAchievements.length).toBeGreaterThanOrEqual(10);
    // Subcollections expostas para o mockDb (players/{id}/achievements + convocação)
    expect(
      (mockCollections as Record<string, unknown[]>)['players/p-leoes-andre/achievements']?.length,
    ).toBeGreaterThan(0);
    expect(mockLeoesConvocations.length).toBeGreaterThanOrEqual(1);
    expect(
      (mockCollections as Record<string, unknown[]>)['teams/team-leoes/convocations'],
    ).toBeDefined();
  });

  it('tem comunicados, notificações, convites e pedidos para a demo', () => {
    expect(mockAnnouncements.length).toBeGreaterThanOrEqual(4);
    expect(mockAnnouncements.some((a) => a.priority === 'urgente')).toBe(true);
    expect(mockAnnouncements.some((a) => a.targetAudience === 'time_especifico')).toBe(true);
    expect(mockNotifications.some((n) => !n.read)).toBe(true);
    const inviteStatuses = new Set(mockTeamInvites.map((i) => i.status));
    expect(inviteStatuses).toContain('active');
    expect(inviteStatuses).toContain('used');
    expect(inviteStatuses).toContain('expired');
    const requestKinds = new Set(mockJoinRequests.map((r) => `${r.status}:${r.type}`));
    expect(requestKinds).toContain('pending:request');
    expect(requestKinds).toContain('pending:waitlist');
    expect(requestKinds).toContain('approved:request');
    expect(requestKinds).toContain('rejected:request');
  });
});

describe('mockData — coerência interna', () => {
  it('sem_time/removido não contam como elenco ativo e approvedPlayersCount bate', () => {
    for (const team of mockTeams) {
      const activeRoster = mockPlayers.filter(
        (p) => p.teamId === team.id && isActiveRosterPlayer(p),
      );
      expect({ teamId: team.id, count: activeRoster.length }).toEqual({
        teamId: team.id,
        count: team.approvedPlayersCount,
      });
      if (team.maxPlayers != null) {
        expect(activeRoster.length).toBeLessThanOrEqual(team.maxPlayers);
      }
    }
    // Existe time CHEIO e time com vaga no campeonato de inscrições abertas
    const openTeams = mockTeams.filter((t) => t.championshipId === 'champ-vila-re');
    expect(openTeams.some((t) => t.approvedPlayersCount === t.maxPlayers)).toBe(true);
    expect(openTeams.some((t) => (t.approvedPlayersCount ?? 0) < (t.maxPlayers ?? 0))).toBe(true);
    expect(openTeams.some((t) => t.status === 'pendente')).toBe(true);
    // sem_time/removido retêm teamId antigo (regra das firestore.rules)
    const inactive = mockPlayers.filter((p) => !isActiveRosterPlayer(p));
    expect(inactive.length).toBeGreaterThanOrEqual(2);
    for (const player of inactive) expect(player.teamId).toBeTruthy();
  });

  it('placar de toda partida finalizada/ao vivo bate com os eventos de gol', () => {
    const playerTeam = new Map(mockPlayers.map((p: Player) => [p.id, p.teamId]));
    const withScore = mockMatches.filter(
      (m: MatchModel) => m.status === 'finalizado' || m.status === 'ao_vivo',
    );
    expect(withScore.length).toBeGreaterThan(0);
    for (const match of withScore) {
      const goals = mockMatchEvents.filter((e) => e.matchId === match.id && e.type === 'gol');
      const home = goals.filter((g) => (g.teamId ?? playerTeam.get(g.playerId)) === match.homeTeamId);
      const away = goals.filter((g) => (g.teamId ?? playerTeam.get(g.playerId)) === match.awayTeamId);
      expect({ id: match.id, home: home.length, away: away.length }).toEqual({
        id: match.id,
        home: match.homeScore,
        away: match.awayScore,
      });
    }
  });

  it('todo evento referencia partida e campeonato coerentes', () => {
    const matchById = new Map(mockMatches.map((m) => [m.id, m]));
    for (const event of mockMatchEvents) {
      const match = matchById.get(event.matchId);
      expect(match).toBeDefined();
      expect(event.championshipId).toBe(match!.championshipId);
      expect([match!.homeTeamId, match!.awayTeamId]).toContain(event.teamId);
    }
  });
});

describe('modo mock — não chama Firebase nos fluxos principais', () => {
  it('leituras e escritas genéricas resolvem no mockDb sem tocar firebase/firestore', async () => {
    const firestoreSdk = jest.requireMock('firebase/firestore');
    const {
      getDocument,
      getCollection,
      addDocument,
      updateDocument,
      subscribeToCollection,
      subscribeToDocument,
    } = require('../services/firestore');

    const champ = await getDocument('championships', 'champ-copa-2026');
    expect(champ?.name).toBe('Copa FJU Tribo de Judá 2026');

    const teams = await getCollection('teams', [
      { field: 'championshipId', operator: '==', value: 'champ-copa-2026' },
    ]);
    expect(teams.length).toBe(4);

    const achievements = await getCollection('players/p-leoes-andre/achievements');
    expect(achievements.length).toBeGreaterThan(0);

    const convocation = await getDocument('teams/team-leoes/convocations', '3');
    expect(convocation?.playerIds?.length).toBeGreaterThan(0);

    let snapshot: unknown[] = [];
    const unsubscribe = subscribeToCollection(
      'announcements',
      [{ field: 'championshipId', operator: '==', value: 'champ-copa-2026' }],
      (data: unknown[]) => {
        snapshot = data;
      },
    );
    unsubscribe();
    expect(snapshot.length).toBeGreaterThanOrEqual(4);

    let doc: unknown = null;
    subscribeToDocument('all_time_rankings', 'scorers', (data: unknown) => {
      doc = data;
    })();
    expect(doc).not.toBeNull();

    const newId = await addDocument('in_app_notifications', {
      userId: 'mock-user-capitao',
      type: 'goal',
      title: 'teste',
      body: 'teste',
      read: false,
    });
    expect(newId).toBeTruthy();
    await updateDocument('in_app_notifications', newId, { read: true });

    for (const fnName of ['getDoc', 'getDocs', 'addDoc', 'setDoc', 'updateDoc', 'deleteDoc', 'onSnapshot']) {
      expect(firestoreSdk[fnName]).not.toHaveBeenCalled();
    }
  });
});
