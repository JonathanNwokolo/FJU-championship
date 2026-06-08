import {
  canApproveTeam,
  canCaptainManageTeam,
  canCaptainRegisterTeam,
  canCreateChampionship,
  canManageChampionship,
  canSubmitMatchScore,
  canViewChampionshipData,
} from '../utils/permissionRules';
import { AppUser, Championship, Team } from '../types';

const organizer = user('org-1', 'organizador');
const otherOrganizer = user('org-2', 'organizador');
const captain = user('captain-1', 'capitao');
const athlete = user('athlete-1', 'atleta');
const championship = { organizerId: 'org-1' } as Championship;
const team = { captainId: 'captain-1' } as Team;

describe('permissionRules', () => {
  it('admin/organizador pode criar campeonato', () => {
    expect(canCreateChampionship(organizer)).toBe(true);
  });

  it('admin/organizador dono pode lancar placar', () => {
    expect(canSubmitMatchScore(organizer, championship)).toBe(true);
    expect(canSubmitMatchScore(otherOrganizer, championship)).toBe(false);
  });

  it('capitao pode gerenciar o proprio time', () => {
    expect(canCaptainManageTeam(captain, team)).toBe(true);
    expect(canCaptainManageTeam(user('other', 'capitao'), team)).toBe(false);
  });

  it('capitao pode inscrever o proprio time', () => {
    expect(canCaptainRegisterTeam(captain, team)).toBe(true);
  });

  it('atleta nao pode editar campeonato', () => {
    expect(canManageChampionship(athlete, championship)).toBe(false);
  });

  it('atleta nao pode aprovar time', () => {
    expect(canApproveTeam(athlete, championship)).toBe(false);
  });

  it('atleta pode visualizar dados', () => {
    expect(canViewChampionshipData(athlete)).toBe(true);
  });
});

function user(id: string, role: AppUser['role']): AppUser {
  return {
    id,
    role,
    name: id,
  };
}
