# Migration Audit - 2026-07-03T19:57:35.396Z

- Projeto: fju-operational-emulator
- Ambiente: emulator
- Modo: dry-run
- Versao: block-6-legacy-data-v1
- Documentos analisados: 177

## Resumo executivo

- Total de problemas: 105
- CRITICAL: 71
- HIGH: 15
- MEDIUM: 16
- LOW: 1
- INFO: 2
- Corrigiveis automaticamente: 13
- Revisao manual: 92
- Mudancas propostas: 13

## Colecoes analisadas

- legacyConvocations: 0
- users: 16
- championships: 6
- teams: 28
- players: 42
- team_memberships: 33
- matches: 24
- match_events: 7
- match_convocations: 2
- match_attendance: 4
- round_awards: 1
- championship_results: 1
- career_stats: 1
- player_history: 1
- all_time_rankings: 1
- organizer_allowlist: 2
- match_status_changes: 3
- match_corrections: 1
- achievements: 0
- group_assignment_logs: 1
- group_fixture_logs: 1
- group_stage_snapshots: 1
- group_transition_logs: 1

## Problemas por categoria

### team-memberships

- Total: 41
- Auto-fix: 8
- Manual: 33

- [HIGH] players/ov_c_p1: Player ativo sem team_memberships/ov_c_team_1_ov_ath_01.
  - Reparo sugerido: Criar team_memberships/ov_c_team_1_ov_ath_01 com ID deterministico.
- [HIGH] players/ov_c_p2: Player ativo sem team_memberships/ov_c_team_1_ov_ath_02.
  - Reparo sugerido: Criar team_memberships/ov_c_team_1_ov_ath_02 com ID deterministico.
- [HIGH] players/ov_c_p3: Player ativo sem team_memberships/ov_c_team_2_ov_ath_03.
  - Reparo sugerido: Criar team_memberships/ov_c_team_2_ov_ath_03 com ID deterministico.
- [HIGH] players/ov_c_p4: Player ativo sem team_memberships/ov_c_team_2_ov_ath_04.
  - Reparo sugerido: Criar team_memberships/ov_c_team_2_ov_ath_04 com ID deterministico.
- [HIGH] players/ov_c_p5: Player ativo sem team_memberships/ov_c_team_3_ov_ath_05.
  - Reparo sugerido: Criar team_memberships/ov_c_team_3_ov_ath_05 com ID deterministico.
- [HIGH] players/ov_c_p6: Player ativo sem team_memberships/ov_c_team_3_ov_ath_06.
  - Reparo sugerido: Criar team_memberships/ov_c_team_3_ov_ath_06 com ID deterministico.
- [HIGH] players/ov_c_p7: Player ativo sem team_memberships/ov_c_team_4_ov_ath_07.
  - Reparo sugerido: Criar team_memberships/ov_c_team_4_ov_ath_07 com ID deterministico.
- [HIGH] players/ov_c_p8: Player ativo sem team_memberships/ov_c_team_4_ov_ath_08.
  - Reparo sugerido: Criar team_memberships/ov_c_team_4_ov_ath_08 com ID deterministico.
- [CRITICAL] team_memberships/ov_a_team_1_ov_ath_01: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_1_ov_ath_02: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_1_ov_ath_injured: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_1_ov_ath_removed: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_1_ov_ath_suspended: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_2_ov_ath_03: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_2_ov_ath_04: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_3_ov_ath_05: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_3_ov_ath_06: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_4_ov_ath_07: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_a_team_4_ov_ath_08: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_1_ov_ath_01: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_1_ov_ath_02: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_2_ov_ath_03: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_2_ov_ath_04: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_3_ov_ath_05: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_3_ov_ath_06: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_4_ov_ath_07: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_4_ov_ath_08: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_5_ov_ath_injured: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_5_ov_ath_suspended: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_b_team_6_ov_b_guest_11: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente, user_inexistente
- [CRITICAL] team_memberships/ov_b_team_6_ov_b_guest_12: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente, user_inexistente
- [CRITICAL] team_memberships/ov_d_team_1_ov_ath_01: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_d_team_2_ov_ath_02: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_d_team_3_ov_ath_03: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_d_team_4_ov_ath_04: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_d_team_5_ov_ath_05: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_d_team_6_ov_ath_06: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_e_team_1_ov_ath_01: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_e_team_2_ov_ath_02: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_e_team_3_ov_ath_03: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente
- [CRITICAL] team_memberships/ov_e_team_4_ov_ath_04: Membership inconsistente com documentos fonte.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: player_inexistente

### approved-player-counts

- Total: 4
- Auto-fix: 4
- Manual: 0

- [MEDIUM] teams/ov_f_team_1: approvedPlayersCount divergente do elenco real.
  - Reparo sugerido: Atualizar approvedPlayersCount para 0.
- [MEDIUM] teams/ov_f_team_2: approvedPlayersCount divergente do elenco real.
  - Reparo sugerido: Atualizar approvedPlayersCount para 0.
- [MEDIUM] teams/ov_f_team_3: approvedPlayersCount divergente do elenco real.
  - Reparo sugerido: Atualizar approvedPlayersCount para 0.
- [MEDIUM] teams/ov_f_team_4: approvedPlayersCount divergente do elenco real.
  - Reparo sugerido: Atualizar approvedPlayersCount para 0.

### registered-team-counts

- Total: 0
- Auto-fix: 0
- Manual: 0


### orphan-players

- Total: 11
- Auto-fix: 0
- Manual: 11

- [MEDIUM] players/ov_a_removed: Player com inconsistencias estruturais.
  - Reparo sugerido: Revisao manual obrigatoria.
  - Conflitos: player_removido_deve_ser_ignorado_em_contador
- [HIGH] players/ov_b_p11: Player com inconsistencias estruturais.
  - Reparo sugerido: Revisao manual obrigatoria.
  - Conflitos: user_inexistente
- [HIGH] players/ov_b_p12: Player com inconsistencias estruturais.
  - Reparo sugerido: Revisao manual obrigatoria.
  - Conflitos: user_inexistente
- [MEDIUM] players/ov_c_p1: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/ov_c_p2: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/ov_c_p3: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/ov_c_p4: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/ov_c_p5: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/ov_c_p6: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/ov_c_p7: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente
- [MEDIUM] players/ov_c_p8: Player com inconsistencias estruturais.
  - Reparo sugerido: Pode ser resolvido pelo backfill de team_memberships se os documentos fonte forem validos.
  - Conflitos: membership_ausente

### captains

- Total: 37
- Auto-fix: 0
- Manual: 37

- [CRITICAL] teams/ov_a_team_1: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_a_team_2: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_a_team_3: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_a_team_4: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_b_team_1: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_b_team_2: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_b_team_3: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_b_team_4: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_b_team_5: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_b_team_6: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_c_team_1: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_c_team_2: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_c_team_3: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_c_team_4: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_d_team_1: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_d_team_2: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_d_team_3: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_d_team_4: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_d_team_5: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_d_team_6: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_e_team_1: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_e_team_2: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_e_team_3: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_e_team_4: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_f_team_1: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_f_team_2: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_f_team_3: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/ov_f_team_4: Time sem capitao valido.
  - Reparo sugerido: Corrigir capitao manualmente; nao atribuir automaticamente.
  - Conflitos: capitao_fora_do_time, capitao_sem_membership_ativo, time_aprovado_sem_capitao_valido
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado
- [CRITICAL] teams/*: Mesmo capitao em dois times no mesmo campeonato.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: capitao_duplicado

### legacy-convocations

- Total: 0
- Auto-fix: 0
- Manual: 0


### current-convocations-attendance

- Total: 1
- Auto-fix: 0
- Manual: 1

- [HIGH] match_attendance/ov_d_a12_ov_d_p1: match_attendance inconsistente.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: presenca_ativa_em_partida_fechada

### matches

- Total: 0
- Auto-fix: 0
- Manual: 0


### round-awards

- Total: 0
- Auto-fix: 0
- Manual: 0


### derived-results

- Total: 0
- Auto-fix: 0
- Manual: 0


### groups

- Total: 11
- Auto-fix: 1
- Manual: 10

- [INFO] matches/ov_d_b13: Partida de grupo cancelada/adiada bloqueia a conclusão até resolução administrativa.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
- [INFO] matches/ov_d_b23: Partida de grupo cancelada/adiada bloqueia a conclusão até resolução administrativa.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
- [HIGH] championships/ov_champ_f: Campeonato grupos + mata-mata sem groupStageConfig.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: group_config_ausente
- [LOW] championships/ov_champ_f: stage ausente em campeonato de grupos já iniciado.
  - Reparo sugerido: Preencher stage conservador 'knockout'.
- [HIGH] teams/ov_f_team_2: Time aprovado sem groupId após sorteio dos grupos.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: time_sem_grupo
- [HIGH] teams/ov_f_team_4: groupId inválido (não normaliza para A/B).
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: group_id_invalido
- [HIGH] matches/ov_f_cross: Partida de grupo entre times de grupos diferentes.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: partida_cross_group
- [CRITICAL] championships/ov_champ_f: Mata-mata gerado sem snapshot de classificados.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: snapshot_ausente
- [MEDIUM] matches/ov_f_ko: Partida de mata-mata sem originSnapshotVersion.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: knockout_sem_origin_snapshot
- [MEDIUM] championships/ov_champ_f: groupStageLockedAt ausente após a transição.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: group_stage_locked_at_ausente
- [MEDIUM] championships/ov_champ_f: knockoutGeneratedAt ausente após a transição.
  - Reparo sugerido: Revisar manualmente antes de aplicar qualquer alteração.
  - Conflitos: knockout_generated_at_ausente

## Mudancas propostas

- team-memberships set team_memberships/ov_c_team_1_ov_ath_01: Backfill seguro de membership ausente.
- team-memberships set team_memberships/ov_c_team_1_ov_ath_02: Backfill seguro de membership ausente.
- team-memberships set team_memberships/ov_c_team_2_ov_ath_03: Backfill seguro de membership ausente.
- team-memberships set team_memberships/ov_c_team_2_ov_ath_04: Backfill seguro de membership ausente.
- team-memberships set team_memberships/ov_c_team_3_ov_ath_05: Backfill seguro de membership ausente.
- team-memberships set team_memberships/ov_c_team_3_ov_ath_06: Backfill seguro de membership ausente.
- team-memberships set team_memberships/ov_c_team_4_ov_ath_07: Backfill seguro de membership ausente.
- team-memberships set team_memberships/ov_c_team_4_ov_ath_08: Backfill seguro de membership ausente.
- approved-player-counts update teams/ov_f_team_1: Recalculo seguro do contador denormalizado de atletas.
- approved-player-counts update teams/ov_f_team_2: Recalculo seguro do contador denormalizado de atletas.
- approved-player-counts update teams/ov_f_team_3: Recalculo seguro do contador denormalizado de atletas.
- approved-player-counts update teams/ov_f_team_4: Recalculo seguro do contador denormalizado de atletas.
- groups update championships/ov_champ_f: Preenchimento conservador de stage para campeonato de grupos já iniciado.

## Observacoes

- Este relatorio nao executa migracao por padrao.
- Execute apply apenas em Emulator ou ambiente explicitamente confirmado.
- championship_results e derivados sao somente auditados neste bloco.
