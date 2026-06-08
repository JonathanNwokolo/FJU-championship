import { useEffect } from 'react';
import { subscribeToCollection, subscribeToDocument } from '../services/index';
import { useAuthStore } from '../stores/authStore';
import { useChampionshipStore } from '../stores/championshipStore';
import { useTeamStore } from '../stores/teamStore';
import { useMatchStore } from '../stores/matchStore';
import { Championship, MatchEvent, MatchModel, Player, Team } from '../types';

/**
 * Firestore live-sync strategy
 * ────────────────────────────
 * 1. Championships are scoped per role (never a global, unfiltered listen):
 *    - organizador → championships where organizerId == user.id
 *    - atleta/capitão → the championships they belong to (discovered from their
 *      player docs and captained teams, then subscribed one document at a time)
 *      PLUS the championships currently open for registration, so they can still
 *      browse and join new ones.
 * 2. Heavy collections (teams/players/matches/match_events) are subscribed ONLY
 *    for the currently selected championship, with safety limits. When the
 *    selected championship changes, the old listeners are torn down and new ones
 *    created.
 * 3. The `in` operator is never used (it caps at 10 ids and forces global reads).
 */
export function useFirestoreSync() {
  const isLoading = useAuthStore((s) => s.isLoading);
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.user?.role);
  const selectedChampionshipId = useChampionshipStore((s) => s.selectedChampionshipId);
  const setChampionships = useChampionshipStore((s) => s.setChampionships);
  const setTeams = useTeamStore((s) => s.setTeams);
  const setPlayers = useTeamStore((s) => s.setPlayers);
  const setMatches = useMatchStore((s) => s.setMatches);
  const setEvents = useMatchStore((s) => s.setEvents);

  // ── Phase 1: championships visible to this user ──────────────────────────────
  useEffect(() => {
    if (isLoading || !userId) return;

    // Organizers only see the championships they own.
    if (role === 'organizador') {
      return subscribeToCollection<Championship>(
        'championships',
        [{ field: 'organizerId', operator: '==', value: userId }],
        setChampionships,
      );
    }

    // Athletes / captains: the union of
    //   (a) championships open for registration (so they can join), and
    //   (b) the championships they already belong to (any status), discovered
    //       from their player docs (userId) and captained teams (captainId).
    const memberDocs = new Map<string, Championship>(); // (b) per-document
    let openChamps: Championship[] = []; // (a) collection snapshot
    const memberUnsubs = new Map<string, () => void>();
    let playerChampIds = new Set<string>();
    let captainChampIds = new Set<string>();

    const emit = () => {
      const merged = new Map<string, Championship>();
      for (const c of openChamps) merged.set(c.id, c);
      for (const [id, c] of memberDocs) merged.set(id, c);
      setChampionships(Array.from(merged.values()));
    };

    const syncMemberSubscriptions = () => {
      const wanted = new Set<string>([...playerChampIds, ...captainChampIds]);

      // Drop listeners for championships we no longer belong to.
      for (const [id, unsub] of memberUnsubs) {
        if (!wanted.has(id)) {
          unsub();
          memberUnsubs.delete(id);
          memberDocs.delete(id);
        }
      }

      // Add listeners for newly discovered championships.
      for (const id of wanted) {
        if (memberUnsubs.has(id)) continue;
        const unsub = subscribeToDocument<Championship>('championships', id, (champ) => {
          if (champ) memberDocs.set(id, champ);
          else memberDocs.delete(id);
          emit();
        });
        memberUnsubs.set(id, unsub);
      }

      emit();
    };

    const unsubOpen = subscribeToCollection<Championship>(
      'championships',
      [{ field: 'status', operator: '==', value: 'inscricoes_abertas' }],
      (champs) => {
        openChamps = champs;
        emit();
      },
    );

    const unsubPlayers = subscribeToCollection<Player>(
      'players',
      [{ field: 'userId', operator: '==', value: userId }],
      (players) => {
        playerChampIds = new Set(
          players.map((p) => p.championshipId).filter((id): id is string => !!id),
        );
        syncMemberSubscriptions();
      },
    );

    const unsubCaptainTeams = subscribeToCollection<Team>(
      'teams',
      [{ field: 'captainId', operator: '==', value: userId }],
      (teams) => {
        captainChampIds = new Set(
          teams.map((t) => t.championshipId).filter((id): id is string => !!id),
        );
        syncMemberSubscriptions();
      },
    );

    return () => {
      unsubOpen();
      unsubPlayers();
      unsubCaptainTeams();
      for (const unsub of memberUnsubs.values()) unsub();
      memberUnsubs.clear();
      memberDocs.clear();
    };
  }, [userId, role, isLoading, setChampionships]);

  // ── Phase 2: heavy data scoped to the selected championship only ─────────────
  useEffect(() => {
    if (isLoading || !userId || !selectedChampionshipId) return;

    const champFilter = [
      { field: 'championshipId', operator: '==' as const, value: selectedChampionshipId },
    ];

    // AUD-08: limites elevados para suportar campeonatos reais sem esconder dados
    // silenciosamente. São apenas tetos de SEGURANÇA (evitam leitura ilimitada),
    // muito acima do volume de um campeonato normal:
    //   - SAFE_PLAYERS: ~32 times × 15 atletas ≈ 480 → 500 com folga.
    //   - SAFE_MATCHES: pontos corridos com 32 times = 31 rodadas × 16 jogos = 496;
    //     mata-mata/grupos ficam bem abaixo → 1000 com folga.
    //   - SAFE_EVENTS: ~1000 partidas × ~2 eventos relevantes → 2000 com folga.
    // Times não têm limite (poucos documentos por campeonato).
    const SAFE_PLAYERS = 500;
    const SAFE_MATCHES = 1000;
    const SAFE_EVENTS = 2000;

    const unsubs = [
      subscribeToCollection<Team>('teams', champFilter, setTeams),
      subscribeToCollection<Player>('players', champFilter, setPlayers, undefined, SAFE_PLAYERS),
      subscribeToCollection<MatchModel>('matches', champFilter, setMatches, undefined, SAFE_MATCHES),
      subscribeToCollection<MatchEvent>('match_events', champFilter, setEvents, undefined, SAFE_EVENTS),
    ];

    // Cleanup: cancel every listener when the selected championship changes.
    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, [userId, isLoading, selectedChampionshipId, setTeams, setPlayers, setMatches, setEvents]);
}
