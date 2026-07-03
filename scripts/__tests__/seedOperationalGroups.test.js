/**
 * Bloco 10.5 — valida que o seed operacional cobre o formato grupos + mata-mata
 * e é consistente com a auditoria, sem depender do Emulator:
 *  - D (grupos em andamento) e E (transição concluída) não têm conflitos de grupo;
 *  - F (diagnóstico) é detectado com as inconsistências controladas;
 *  - buildDocs é determinístico/idempotente (mesmos IDs e contagem em duas execuções).
 */
const { buildDocs } = require('../seedOperationalValidation');
const { auditLegacyData } = require('../migration/legacyDataCore');

function datasetFromDocs(docs) {
  const dataset = {};
  for (const [path, data] of Object.entries(docs)) {
    const collection = path.split('/')[0];
    (dataset[collection] ||= []).push(data);
  }
  return dataset;
}

function groupConflictsFor(report, fragment) {
  return report.categories.groups.issues
    .filter((issue) => issue.documentPath.includes(fragment))
    .flatMap((issue) => issue.conflicts || []);
}

describe('Bloco 10.5 - seed operacional grupos + mata-mata', () => {
  const docs = buildDocs();
  const dataset = datasetFromDocs(docs);
  const report = auditLegacyData(dataset, { projectId: 'ov-emulator', environment: 'unit' });

  it('inclui os campeonatos D, E e F do formato de grupos', () => {
    const ids = new Set(dataset.championships.map((c) => c.id));
    expect(ids.has('ov_champ_d')).toBe(true);
    expect(ids.has('ov_champ_e')).toBe(true);
    expect(ids.has('ov_champ_f')).toBe(true);
    for (const id of ['ov_champ_d', 'ov_champ_e', 'ov_champ_f']) {
      expect(dataset.championships.find((c) => c.id === id).format).toBe('grupos_e_mata_mata');
    }
  });

  it('grava logs/snapshot imutáveis do formato', () => {
    expect(dataset.group_assignment_logs.length).toBeGreaterThanOrEqual(1);
    expect(dataset.group_fixture_logs.length).toBeGreaterThanOrEqual(1);
    expect(dataset.group_stage_snapshots.some((s) => s.championshipId === 'ov_champ_e')).toBe(true);
    expect(dataset.group_transition_logs.some((l) => l.championshipId === 'ov_champ_e')).toBe(true);
  });

  it('D (em andamento) não tem conflitos estruturais de grupo', () => {
    expect(groupConflictsFor(report, 'ov_champ_d')).toEqual([]);
    expect(groupConflictsFor(report, 'ov_d_')).toEqual([]);
  });

  it('E (transição concluída) não tem conflitos estruturais de grupo', () => {
    expect(groupConflictsFor(report, 'ov_champ_e')).toEqual([]);
    expect(groupConflictsFor(report, 'ov_e_')).toEqual([]);
  });

  it('F (diagnóstico) é detectado com as inconsistências controladas', () => {
    const conflicts = new Set([
      ...groupConflictsFor(report, 'ov_champ_f'),
      ...groupConflictsFor(report, 'ov_f_'),
    ]);
    for (const expected of [
      'group_config_ausente',
      'time_sem_grupo',
      'group_id_invalido',
      'partida_cross_group',
      'snapshot_ausente',
      'knockout_sem_origin_snapshot',
    ]) {
      expect(conflicts.has(expected)).toBe(true);
    }
    // Snapshot ausente com mata-mata gerado é CRITICAL.
    const critical = report.categories.groups.issues.find(
      (i) => i.documentPath.includes('ov_champ_f') && i.conflicts.includes('snapshot_ausente'),
    );
    expect(critical.severity).toBe('CRITICAL');
  });

  it('buildDocs é determinístico/idempotente (mesmos IDs e contagem)', () => {
    const second = buildDocs();
    expect(Object.keys(second).sort()).toEqual(Object.keys(docs).sort());
    expect(Object.keys(second).length).toBe(Object.keys(docs).length);
  });
});
