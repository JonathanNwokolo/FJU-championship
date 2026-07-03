# Migration Audit - 2026-07-01T01:06:17.299Z

- Projeto: fju-migration-emulator
- Ambiente: emulator
- Modo: dry-run
- Versao: block-6-legacy-data-v1
- Documentos analisados: 20

## Resumo executivo

- Total de problemas: 27
- CRITICAL: 5
- HIGH: 15
- MEDIUM: 6
- LOW: 0
- INFO: 1
- Corrigiveis automaticamente: 6
- Revisao manual: 21
- Mudancas propostas: 3

## Colecoes analisadas

- legacyConvocations: 2
- users: 3
- championships: 1
- teams: 3
- players: 4
- team_memberships: 0
- matches: 3
- match_events: 0
- match_convocations: 0
- match_attendance: 1
- round_awards: 2
- championship_results: 1
- career_stats: 0
- player_history: 0
- all_time_rankings: 0
- organizer_allowlist: 0
- match_status_changes: 0
- match_corrections: 0
- achievements: 0

## Problemas por categoria

### team-memberships

- Total: 3
- Auto-fix: 3
- Manual: 0

- [HIGH] players/p1: Player ativo sem team_memberships/team1_u1.
  - Reparo sugerido: Criar team_memberships/team1_u1 com ID deterministico.
- [HIGH] players/p2: Player ativo sem team_memberships/team1_u2.
  - Reparo sugerido: Criar team_memberships/team1_u2 com ID deterministico.
- [HIGH] players/p2b: Player ativo sem team_memberships/team2_u2.
  - Reparo sugerido: Criar team_memberships/team2_u2 com ID deterministico.

### approved-player-counts

- Total: 3
- Auto-fix: 0
- Manual: 3

- [HIGH] teams/team1: approvedPlayersCount negativo.
  - Reparo sugerido: Recalcular para 2.
- [CRITICAL] players/*: Player/user ocupa vaga em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_em_dois_times
- [HIGH] players/*: Numero de camisa duplicado dentro do elenco ativo.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: numero_duplicado

### registered-team-counts

- Total: 2
- Auto-fix: 2
- Manual: 0

- [MEDIUM] championships/champ1: registeredTeamsCount divergente da regra atual.
  - Reparo sugerido: Atualizar registeredTeamsCount para 2.
- [HIGH] championships/champ1: Campeonato parece lotado pelo contador, mas ha vaga real.
  - Reparo sugerido: Atualizar registeredTeamsCount para 2.

### orphan-players

- Total: 5
- Auto-fix: 0
- Manual: 5

- [MEDIUM] players/p1: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/p2: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/p2b: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [HIGH] players/removed: Player com inconsistencias estruturais.
  - Reparo sugerido: Revisao manual obrigatoria.
  - Conflitos: user_inexistente, player_removido_deve_ser_ignorado_em_contador
- [CRITICAL] players/*: Mesmo userId ativo em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_em_dois_times

### captains

- Total: 4
- Auto-fix: 0
- Manual: 4

- [HIGH] teams/rejected: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo
- [CRITICAL] teams/team1: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/team2: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: captain_user_inexistente, capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado

### legacy-convocations

- Total: 2
- Auto-fix: 1
- Manual: 1

- [HIGH] teams/team1/convocations/99: Convocacao legada sem partida compativel.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: partida_inexistente
- [INFO] teams/team2/convocations/1: Convocacao legada migravel para match_convocations.
  - Reparo sugerido: Criar match_convocations/m1_team2 preservando legacySourcePath.

### current-convocations-attendance

- Total: 1
- Auto-fix: 0
- Manual: 1

- [HIGH] match_attendance/m1_p2: match_attendance inconsistente.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: jogador_nao_convocado

### matches

- Total: 3
- Auto-fix: 0
- Manual: 3

- [HIGH] matches/m1: Partida inconsistente.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: correctionVersion_ausente_em_legado, statusVersion_ausente_em_legado
- [HIGH] matches/m2: Partida inconsistente.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: correctionVersion_ausente_em_legado, statusVersion_ausente_em_legado
- [HIGH] matches/wo-bad: Partida inconsistente.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: wo_sem_resultSource, wo_sem_placar_3x0, correctionVersion_ausente_em_legado, statusVersion_ausente_em_legado

### round-awards

- Total: 2
- Auto-fix: 0
- Manual: 2

- [MEDIUM] round_awards/legacy-auto: round_award inconsistente.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: id_automatico_legado
- [HIGH] round_awards/*: Awards duplicados com vencedores conflitantes.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: vencedores_conflitantes

### derived-results

- Total: 2
- Auto-fix: 0
- Manual: 2

- [MEDIUM] championship_results/champ1: totalTeams diverge da quantidade atual de times.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
- [HIGH] championship_results/champ1: Campeao aponta para time inexistente no campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: winnerId_invalido

## Mudancas propostas

- team-memberships set team_memberships/team1_u1: Backfill seguro de membership ausente.
- registered-team-counts update championships/champ1: Recalculo seguro do contador denormalizado de times conforme regra atual.
- legacy-convocations set match_convocations/m1_team2: Migracao segura de convocacao legada nao ambigua.

## Observacoes

- Este relatorio nao executa migracao por padrao.
- Execute apply apenas em Emulator ou ambiente explicitamente confirmado.
- championship_results e derivados sao somente auditados neste bloco.
