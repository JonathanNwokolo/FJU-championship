/**
 * Gera código de convite de 6 caracteres.
 * Usa apenas caracteres que não geram confusão visual:
 * - Remove I, O (parecem com 1 e 0)
 * - Remove 0, 1 (parecem com O e I)
 */
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => 
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}
