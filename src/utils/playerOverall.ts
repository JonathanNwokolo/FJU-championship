export function calculateOverall(goals: number, yellowCards: number, redCards: number): number {
  return Math.min(99, Math.max(40, Math.round(50 + goals * 3 - yellowCards * 1 - redCards * 5)));
}

export function getOverallColor(overall: number): string {
  if (overall >= 85) return '#FFD700';
  if (overall >= 70) return '#C0C0C0';
  return '#CD7F32';
}

export function getCardGradient(overall: number): string[] {
  if (overall >= 85) return ['#B8860B', '#FFD700', '#B8860B'];
  if (overall >= 70) return ['#708090', '#C0C0C0', '#708090'];
  return ['#8B4513', '#CD7F32', '#8B4513'];
}
