type GroupLabel = 'A' | 'B';

function segment(value: string | number): string {
  const raw = String(value).trim();
  if (!raw) return 'empty';
  return encodeURIComponent(raw).replace(/\./g, '%2E');
}

export function getGroupId(championshipId: string, group: GroupLabel): string {
  return `champ_${segment(championshipId)}_group_${segment(group)}`;
}

export function getGroupFixtureId(
  championshipId: string,
  groupId: string,
  teamAId: string,
  teamBId: string,
): string {
  const [firstTeamId, secondTeamId] = [teamAId, teamBId].map(segment).sort();
  return [
    'champ',
    segment(championshipId),
    'group',
    segment(groupId),
    'fixture',
    firstTeamId,
    secondTeamId,
  ].join('__');
}

export function getKnockoutFixtureId(
  championshipId: string,
  round: string | number,
  slot: string | number,
): string {
  return [
    'champ',
    segment(championshipId),
    'knockout',
    'round',
    segment(round),
    'slot',
    segment(slot),
  ].join('__');
}

export function getGroupSnapshotId(championshipId: string, version: number): string {
  return ['champ', segment(championshipId), 'group_snapshot', segment(version)].join('__');
}
