import { generateInviteCode } from '../utils/generateInviteCode';
import {
  calculateOverall,
  getOverallColor,
  getCardGradient,
} from '../utils/playerOverall';

describe('generateInviteCode', () => {
  it('deve gerar código com 6 caracteres', () => {
    const code = generateInviteCode();
    expect(code).toHaveLength(6);
  });

  it('deve gerar códigos únicos', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateInviteCode());
    }
    // Com 32^6 possibilidades, 100 códigos devem ser únicos
    expect(codes.size).toBe(100);
  });

  it('não deve conter caracteres confusos (I, O, 0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateInviteCode();
      expect(code).not.toMatch(/[IO01]/);
    }
  });
});

describe('calculateOverall', () => {
  it('deve retornar 50 para jogador sem estatísticas', () => {
    expect(calculateOverall(0, 0, 0, 0)).toBe(50);
  });

  it('deve aumentar overall com gols', () => {
    const semGols = calculateOverall(0, 0, 0, 0);
    const comGols = calculateOverall(5, 0, 0, 0);
    expect(comGols).toBeGreaterThan(semGols);
  });

  it('deve diminuir overall com cartões amarelos', () => {
    const semCartao = calculateOverall(0, 0, 0, 0);
    const comCartao = calculateOverall(0, 2, 0, 0);
    expect(comCartao).toBeLessThan(semCartao);
  });

  it('deve diminuir mais com cartões vermelhos', () => {
    // 1 amarelo = -1, 1 vermelho = -3
    const comAmarelo = calculateOverall(0, 1, 0, 0);
    const comVermelho = calculateOverall(0, 0, 1, 0);
    expect(comVermelho).toBeLessThan(comAmarelo);
  });

  it('deve limitar mínimo em 40', () => {
    expect(calculateOverall(0, 10, 10, 0)).toBeGreaterThanOrEqual(40);
  });

  it('deve limitar máximo em 99', () => {
    expect(calculateOverall(100, 0, 0, 100)).toBeLessThanOrEqual(99);
  });
});

describe('getOverallColor', () => {
  it('deve retornar dourado para overall >= 85', () => {
    expect(getOverallColor(85)).toBe('#FFD700');
    expect(getOverallColor(99)).toBe('#FFD700');
  });

  it('deve retornar prata para overall >= 70 e < 85', () => {
    expect(getOverallColor(70)).toBe('#C0C0C0');
    expect(getOverallColor(84)).toBe('#C0C0C0');
  });

  it('deve retornar bronze para overall < 70', () => {
    expect(getOverallColor(69)).toBe('#CD7F32');
    expect(getOverallColor(40)).toBe('#CD7F32');
  });
});

describe('getCardGradient', () => {
  it('deve retornar gradiente dourado para overall >= 85', () => {
    const gradient = getCardGradient(90);
    expect(gradient).toContain('#FFD700');
  });

  it('deve retornar gradiente prata para overall >= 70 e < 85', () => {
    const gradient = getCardGradient(75);
    expect(gradient).toContain('#C0C0C0');
  });

  it('deve retornar gradiente bronze para overall < 70', () => {
    const gradient = getCardGradient(60);
    expect(gradient).toContain('#CD7F32');
  });
});
