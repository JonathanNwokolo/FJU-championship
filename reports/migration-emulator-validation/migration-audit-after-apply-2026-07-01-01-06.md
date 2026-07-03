# Migration Audit - 2026-07-01T01:06:17.448Z

- Projeto: fju-migration-emulator
- Ambiente: emulator
- Modo: apply
- Versao: block-6-legacy-data-v1
- Documentos analisados: 22

## Resumo executivo

- Total de problemas: 23
- CRITICAL: 5
- HIGH: 13
- MEDIUM: 5
- LOW: 0
- INFO: 0
- Corrigiveis automaticamente: 2
- Revisao manual: 21
- Mudancas propostas: 0

## Colecoes analisadas

- legacyConvocations: 2
- users: 3
- championships: 1
- teams: 3
- players: 4
- team_memberships: 1
- matches: 3
- match_events: 0
- match_convocations: 1
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

- Total: 2
- Auto-fix: 2
- Manual: 0

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

- Total: 0
- Auto-fix: 0
- Manual: 0


### orphan-players

- Total: 4
- Auto-fix: 0
- Manual: 4

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
- Auto-fix: 0
- Manual: 2

- [HIGH] teams/team1/convocations/99: Convocacao legada sem partida compativel.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: partida_inexistente
- [MEDIUM] teams/team2/convocations/1: Convocacao atual ja existe para a partida.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: convocacao_duplicada

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

- Nenhuma mudanca automatica proposta.

## Observacoes

- Este relatorio nao executa migracao por padrao.
- Execute apply apenas em Emulator ou ambiente explicitamente confirmado.
- championship_results e derivados sao somente auditados neste bloco.
