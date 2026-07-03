import {
  getGroupFixtureId,
  getGroupId,
  getGroupSnapshotId,
  getKnockoutFixtureId,
} from '../utils/groupStageIds';

describe('groupStageIds', () => {
  it('gera groupId estavel', () => {
    expect(getGroupId('champ-1', 'A')).toBe(getGroupId('champ-1', 'A'));
    expect(getGroupId('champ-1', 'A')).not.toBe(getGroupId('champ-1', 'B'));
  });

  it('normaliza a ordem dos times no fixture de grupo', () => {
    expect(getGroupFixtureId('champ-1', 'A', 'team-1', 'team-2')).toBe(
      getGroupFixtureId('champ-1', 'A', 'team-2', 'team-1'),
    );
  });

  it('campeonatos diferentes geram IDs diferentes', () => {
    expect(getGroupFixtureId('champ-1', 'A', 'team-1', 'team-2')).not.toBe(
      getGroupFixtureId('champ-2', 'A', 'team-1', 'team-2'),
    );
  });

  it('slots diferentes do mata-mata geram IDs diferentes', () => {
    expect(getKnockoutFixtureId('champ-1', 'semi', 1)).not.toBe(
      getKnockoutFixtureId('champ-1', 'semi', 2),
    );
  });

  it('snapshotId considera campeonato e versao', () => {
    expect(getGroupSnapshotId('champ-1', 1)).toBe(getGroupSnapshotId('champ-1', 1));
    expect(getGroupSnapshotId('champ-1', 1)).not.toBe(getGroupSnapshotId('champ-1', 2));
  });

  it('trata caracteres invalidos sem aleatoriedade', () => {
    const id = getGroupFixtureId('champ/1', 'group A', 'team.alpha', 'team/beta');

    expect(id).toBe(getGroupFixtureId('champ/1', 'group A', 'team/beta', 'team.alpha'));
    expect(id).toContain('%2F');
    expect(id).toContain('%2E');
    expect(id).not.toContain('undefined');
  });
});
