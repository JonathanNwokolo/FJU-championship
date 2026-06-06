/**
 * Team shields/logo presets library
 * Each shield uses MaterialCommunityIcons with the team's primaryColor
 */
export const TEAM_SHIELDS = [
  { id: 'shield_01', icon: 'shield', color: 'dynamic' },
  { id: 'crown_01', icon: 'crown', color: 'dynamic' },
  { id: 'lightning_01', icon: 'lightning-bolt', color: 'dynamic' },
  { id: 'star_01', icon: 'star-four-points', color: 'dynamic' },
  { id: 'fire_01', icon: 'fire', color: 'dynamic' },
  { id: 'sword_01', icon: 'sword-cross', color: 'dynamic' },
  { id: 'eagle_01', icon: 'bird', color: 'dynamic' },
  { id: 'lion_01', icon: 'paw', color: 'dynamic' },
  { id: 'cross_01', icon: 'cross', color: 'dynamic' },
  { id: 'dove_01', icon: 'dove', color: 'dynamic' },
] as const;

export type TeamShieldId = typeof TEAM_SHIELDS[number]['id'];
export type TeamShieldIcon = typeof TEAM_SHIELDS[number]['icon'];

export function getShieldById(id: string) {
  return TEAM_SHIELDS.find((shield) => shield.id === id);
}
