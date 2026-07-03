/**
 * Bloco 10.4 — Fase 2. Modelo de revisão da transição grupos → mata-mata.
 *
 * PURO e sem efeitos: apenas COMPÕE funções de domínio já aprovadas
 * (`canCompleteGroupStage`, `calculateAllStandings`,
 * `buildGroupStageQualificationSnapshot`, `buildKnockoutSeedsFromGroupSnapshot`)
 * para produzir o que a tela de revisão precisa exibir. Não recalcula
 * standings, não reordena classificados e não inventa cruzamentos: tudo vem
 * dos helpers testados em 10.1–10.2. A tela apenas renderiza este modelo.
 */

import type {
  Championship,
  GroupStageCompletionIssue,
  GroupStandingRow,
  GroupTiebreakReason,
  MatchEvent,
  MatchModel,
  Team,
} from '../types';
import { DEFAULT_GROUP_STAGE_CONFIG } from './groupStageRules';
import {
  buildGroupStageQualificationSnapshot,
  buildKnockoutSeedsFromGroupSnapshot,
  calculateAllStandings,
  canCompleteGroupStage,
} from './groupStageTransition';
import { getQualifierOriginLabel, type SupportedGroupId } from './groupStagePresentation';

const GROUP_IDS: SupportedGroupId[] = ['A', 'B'];

export interface ReviewTeamRef {
  teamId: string;
  teamName: string;
  primaryColor: string;
  groupId: SupportedGroupId;
  position: number;
  originLabel: string;
  points: number;
  goalDifference: number;
  tiebreakReason?: GroupTiebreakReason;
}

export interface ReviewCrossing {
  slot: number;
  home: Pick<ReviewTeamRef, 'teamId' | 'teamName' | 'originLabel'> | null;
  away: Pick<ReviewTeamRef, 'teamId' | 'teamName' | 'originLabel'> | null;
  /** BYE estrutural: apenas um lado ocupado. Nunca é "time × vazio" jogável. */
  isBye: boolean;
  sameGroup: boolean;
}

export interface GroupStageReviewModel {
  standings: Record<SupportedGroupId, GroupStandingRow[]> | null;
  standingsError: boolean;
  qualifiers: ReviewTeamRef[];
  eliminated: ReviewTeamRef[];
  qualifierCount: number;
  qualifiersPerGroup: number;
  crossings: ReviewCrossing[] | null;
  hasBye: boolean;
  byeCount: number;
  blockers: GroupStageCompletionIssue[];
  warnings: GroupStageCompletionIssue[];
  allowed: boolean;
  resolvedMatchCount: number;
  expectedMatchCount: number;
}

export interface BuildGroupStageReviewInput {
  championship: Championship;
  teams: Team[];
  matches: MatchModel[];
  events?: MatchEvent[];
}

function toTeamRef(row: GroupStandingRow, groupId: SupportedGroupId): ReviewTeamRef {
  return {
    teamId: row.teamId,
    teamName: row.teamName,
    primaryColor: row.primaryColor,
    groupId,
    position: row.position,
    originLabel: getQualifierOriginLabel(row.position, groupId),
    points: row.points,
    goalDifference: row.goalDifference,
    tiebreakReason: row.tiebreakReason,
  };
}

export function buildGroupStageReview(input: BuildGroupStageReviewInput): GroupStageReviewModel {
  const { championship, teams, matches } = input;
  const events = input.events ?? [];
  const config = championship.groupStageConfig ?? DEFAULT_GROUP_STAGE_CONFIG;
  const qualifiersPerGroup = config.qualifiersPerGroup;

  // Standings: fonte única é calculateAllStandings (pode lançar em dados corruptos).
  let standings: Record<SupportedGroupId, GroupStandingRow[]> | null = null;
  let standingsError = false;
  try {
    standings = calculateAllStandings(championship, teams, matches, events);
  } catch {
    standingsError = true;
  }

  // Bloqueios/avisos: reutiliza o gatekeeper oficial da transição.
  const completion = canCompleteGroupStage({
    championship,
    teams,
    matches,
    events,
    standingsByGroup: standings ?? undefined,
  });

  const qualifiers: ReviewTeamRef[] = [];
  const eliminated: ReviewTeamRef[] = [];
  if (standings) {
    for (const groupId of GROUP_IDS) {
      const rows = standings[groupId] ?? [];
      rows.forEach((row, index) => {
        const ref = toTeamRef(row, groupId);
        if (index < qualifiersPerGroup) qualifiers.push(ref);
        else eliminated.push(ref);
      });
    }
  }

  // Cruzamentos + BYE vêm do snapshot/seed, nunca de cálculo paralelo aqui.
  // Se houver bloqueio (posição indefinida, etc.) o snapshot lança e omitimos.
  let crossings: ReviewCrossing[] | null = null;
  let byeCount = 0;
  if (standings && !standingsError) {
    try {
      const snapshot = buildGroupStageQualificationSnapshot({
        championship,
        teams,
        matches,
        events,
        generatedBy: 'review-preview',
        generatedAt: new Date(0),
      });
      const seeding = buildKnockoutSeedsFromGroupSnapshot(snapshot, config);
      byeCount = seeding.byeCount;
      const nameById = new Map(teams.map((team) => [team.id, team.name] as const));
      const originById = new Map(qualifiers.map((q) => [q.teamId, q.originLabel] as const));
      crossings = seeding.expectedPairings.map((pairing, index) => {
        const home = pairing.homeTeamId
          ? {
              teamId: pairing.homeTeamId,
              teamName: nameById.get(pairing.homeTeamId) ?? pairing.homeTeamId,
              originLabel: originById.get(pairing.homeTeamId) ?? '',
            }
          : null;
        const away = pairing.awayTeamId
          ? {
              teamId: pairing.awayTeamId,
              teamName: nameById.get(pairing.awayTeamId) ?? pairing.awayTeamId,
              originLabel: originById.get(pairing.awayTeamId) ?? '',
            }
          : null;
        return {
          slot: index + 1,
          home,
          away,
          isBye: (!!home && !away) || (!home && !!away),
          sameGroup: pairing.sameGroup,
        };
      });
    } catch {
      crossings = null;
      byeCount = 0;
    }
  }

  return {
    standings,
    standingsError,
    qualifiers,
    eliminated,
    qualifierCount: qualifiers.length,
    qualifiersPerGroup,
    crossings,
    hasBye: byeCount > 0,
    byeCount,
    blockers: completion.blockers,
    warnings: completion.warnings,
    allowed: completion.allowed,
    resolvedMatchCount: completion.resolvedMatchCount,
    expectedMatchCount: completion.expectedMatchCount,
  };
}
