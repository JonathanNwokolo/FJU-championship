# CLAUDE.md — FJU Championship

## Visão geral do projeto

O FJU Championship é um aplicativo mobile para gerenciamento de campeonatos esportivos da FJU.

O aplicativo atende três perfis principais:

* Organizador
* Capitão
* Atleta

Principais recursos:

* Criação e gerenciamento de campeonatos
* Inscrição e aprovação de times
* Gestão de atletas e elenco
* Convites e solicitações para entrada em times
* Pontos corridos
* Mata-mata
* Geração de rodadas e chaveamento
* Partidas ao vivo e finalizadas
* Registro de gols, assistências e cartões
* Classificação e estatísticas
* Suspensões
* Convocações
* Votação de craque da rodada
* Notificações e comunicados
* Perfil, carreira, conquistas e Hall da Fama

## Stack

* React Native
* Expo SDK 56
* TypeScript
* Zustand
* Firebase Authentication
* Firestore
* Firebase Storage
* Jest
* Firebase Emulator Suite
* ESLint
* Maestro para testes E2E

O projeto não usa Cloud Functions.

Toda solução deve ser compatível com o plano atual do Firebase e com a arquitetura client-side existente.

## Comandos obrigatórios

Antes de considerar qualquer alteração concluída, executar:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:rules
```

Quando a alteração for localizada, rodar também os testes focados antes da suíte completa.

Exemplos:

```bash
npm test -- roundRobin --runInBand
npm test -- matchCorrection --runInBand
```

Não declarar que uma alteração está validada se algum comando obrigatório não tiver sido executado.

Caso um comando não possa ser executado, explicar claramente o motivo.

## Regras gerais de trabalho

Antes de alterar código:

1. Ler os arquivos relacionados ao fluxo.
2. Mapear a fonte de verdade dos dados.
3. Identificar regras já existentes.
4. Listar riscos de regressão.
5. Verificar testes existentes.
6. Apresentar um plano curto de implementação.

Não iniciar uma reescrita completa sem necessidade.

Não alterar arquivos fora do escopo apenas para “melhorar” o projeto.

Não fazer alterações cosméticas enquanto existirem problemas de lógica, integridade ou segurança no mesmo fluxo.

Não avançar para outro bloco sem concluir e validar o bloco atual.

## Escopo e disciplina

Ao receber uma tarefa:

* Trabalhar apenas no escopo solicitado.
* Não implementar funcionalidades adicionais sem autorização.
* Não aproveitar a tarefa para refatorar áreas não relacionadas.
* Não alterar arquitetura, modelos ou contratos silenciosamente.
* Não remover regras existentes sem explicar o impacto.
* Não criar abstrações genéricas sem uso real.
* Não duplicar lógica entre telas, hooks e services.

Se encontrar um problema fora do escopo:

* documentar;
* informar gravidade;
* sugerir backlog;
* não corrigir automaticamente, salvo se bloquear diretamente a tarefa atual.

## Arquitetura

Manter a separação:

* `screens`: interface e coordenação de ações
* `services`: regras de negócio, persistência e integrações
* `stores`: estado global
* `hooks`: composição e sincronização
* `utils`: funções puras
* `types`: contratos e modelos
* `rules`: testes de Firestore e Storage Rules
* `mocks`: dados e comportamento de demonstração

Evitar lógica crítica diretamente em telas.

Regras de negócio importantes devem ficar em services ou utils testáveis.

Telas não devem ser a única camada de validação.

## Firebase e segurança

Toda ação administrativa deve ser validada também nas Firestore Rules.

Nunca confiar somente em:

* papel armazenado no cliente;
* estado do Zustand;
* botão oculto;
* variável pública;
* validação da interface.

Variáveis `EXPO_PUBLIC_*` nunca devem ser usadas como autorização de segurança.

### Organizador

O papel de organizador depende de:

```text
organizer_allowlist/{uid}
```

Usuários comuns não podem:

* criar a própria allowlist;
* editar a própria allowlist;
* transformar o próprio papel em organizador;
* administrar campeonatos de outros organizadores.

Um organizador só pode alterar dados dos campeonatos que possui.

### Membership de time

A fonte confiável de vínculo entre usuário e time é:

```text
team_memberships/{teamId}_{uid}
```

Não depender exclusivamente de `users.teamId`.

Todo fluxo de entrada, saída, aprovação ou remoção deve manter o membership consistente.

### Contadores

Os campos:

* `approvedPlayersCount`
* `registeredTeamsCount`

são caches e mecanismos de serialização.

Qualquer fluxo que altere elenco ou quantidade de times deve avaliar se precisa atualizar esses campos.

Nunca permitir contador negativo.

Mudanças concorrentes devem usar transação.

### Storage

Uploads devem ser restritos por:

* proprietário;
* time autorizado;
* caminho permitido;
* tipo de arquivo;
* tamanho máximo.

Não permitir escrita genérica em qualquer path.

## Modo mock

O modo mock é ativado apenas por:

```env
EXPO_PUBLIC_USE_MOCK=true
```

O padrão deve ser Firebase real.

Não reintroduzir:

* `USE_MOCK_DATA`
* `EXPO_PUBLIC_USE_MOCK_DATA`
* flags equivalentes duplicadas

O modo mock deve reproduzir as regras principais do Firebase sempre que possível.

Não corrigir apenas o fluxo real deixando o mock inconsistente, nem o contrário.

## Integridade dos dados

Operações críticas devem ser:

* transacionais;
* idempotentes;
* auditáveis quando necessário;
* resistentes a duplo toque;
* resistentes a dois dispositivos;
* seguras em retry.

Usar IDs determinísticos quando a entidade deveria existir apenas uma vez.

Exemplos:

```text
team_memberships/{teamId}_{uid}
round_awards/{championshipId}_{round}
```

Não usar `addDocument` com ID automático para dados naturalmente únicos.

## Campeonatos

Estados atuais devem ser respeitados.

Não adicionar novos estados sem mapear:

* transições válidas;
* ações permitidas;
* telas afetadas;
* Rules;
* mocks;
* testes;
* compatibilidade com dados antigos.

Campeonatos com `championship_results` são considerados definitivamente encerrados para fluxos que ainda não suportam reprocessamento completo.

Não alterar resultados congelados sem atualizar de forma consistente:

* career_stats
* player_history
* all_time_rankings
* achievements
* MVP
* Hall da Fama
* campeão
* artilheiro

## Times e atletas

Garantir:

* atleta não entra em dois times no mesmo campeonato;
* `maxPlayers` não é ultrapassado;
* `maxTeams` não é ultrapassado;
* entradas repetidas são idempotentes;
* jogador removido mantém histórico;
* `sem_time` e `removido` não ocupam vaga ativa;
* números de camisa ativos não duplicam;
* capitão não altera campos administrativos do time;
* atleta não altera status competitivo diretamente.

Fluxos concorrentes devem ser transacionais.

## Mata-mata

O mata-mata simples deve obedecer:

```text
bracketSize = próxima potência de 2 maior ou igual ao número de times
byes = bracketSize - número de times
partidas competitivas = número de times - 1
```

Byes são avanços estruturais.

Não criar partidas competitivas:

* vazio contra vazio;
* finalizadas em 0x0 apenas para empurrar a chave.

Garantir:

* `nextMatchId` válido;
* nenhuma partida órfã;
* final única;
* apenas um campeão;
* vencedor avançando ao slot correto;
* compatibilidade com 3, 5, 6, 7, 9 e outras quantidades não-potência de 2.

Não regenerar automaticamente fixtures já existentes.

## Partidas finalizadas

Eventos de partida finalizada não podem ser alterados livremente.

O fluxo oficial para correção é o serviço de correção controlada.

A correção exige:

* organizador dono;
* motivo obrigatório;
* `correctionVersion`;
* `correctionId`;
* log imutável;
* placar reconciliado com eventos;
* transação;
* proteção contra repetição;
* proteção contra versão antiga.

Logs são armazenados em:

```text
match_corrections/{correctionId}
```

Eventos removidos devem usar soft delete:

* `removedAt`
* `removedByCorrectionId`

Não apagar fisicamente eventos que fazem parte de uma correção auditável.

### Mata-mata e correção

Se o vencedor não mudar:

* corrigir placar e eventos;
* não alterar a próxima partida.

Se o vencedor mudar e a próxima partida estiver agendada:

* trocar apenas o slot correspondente;
* preservar o outro participante.

Se a próxima partida estiver ao vivo ou finalizada:

* bloquear a mudança automática.

Se existir `championship_results`:

* bloquear correção até existir reprocessamento completo.

## Classificação

A classificação deve considerar:

* times aprovados;
* dados legados sem `status`, quando explicitamente suportados.

Não incluir:

* pendentes;
* rejeitados.

Um time aprovado sem jogos deve aparecer zerado.

Critérios de desempate e mini-tabela devem permanecer testados.

Não alterar a ordem dos critérios sem decisão explícita de produto.

## Estatísticas

Eventos ativos alimentam:

* gols;
* assistências;
* cartões;
* suspensões;
* estatísticas individuais.

O placar da partida alimenta:

* classificação;
* vencedor;
* progressão do mata-mata.

Placar e eventos de gol não podem ficar divergentes após correção.

Eventos com `removedAt` não devem contar.

## Auditoria

Ações administrativas importantes devem preservar:

* autor;
* motivo;
* data;
* antes;
* depois;
* versão;
* efeitos derivados.

Logs de auditoria devem ser imutáveis.

Usuários comuns não podem criá-los, editá-los ou apagá-los.

## Firestore Rules

Ao alterar `firestore.rules` ou `storage.rules`:

1. Atualizar ou criar testes.
2. Rodar `npm run test:rules`.
3. Testar sucesso e negação.
4. Validar organizador dono e organizador externo.
5. Validar capitão, atleta e não autenticado.
6. Não abrir regra ampla apenas para fazer o teste passar.

Casos `PERMISSION_DENIED` esperados em `assertFails` não são falhas.

## Testes

Toda correção de bug deve incluir teste de regressão.

Testar:

* caminho feliz;
* permissão negada;
* repetição;
* concorrência;
* dados legados;
* falha parcial;
* modo mock;
* Firebase real ou Emulator, quando aplicável.

Não testar apenas helpers quando o risco está no service principal.

Para operações transacionais, testar diretamente o serviço responsável.

## Compatibilidade

Preservar compatibilidade com dados existentes.

Ao adicionar campo novo:

* preferir campo opcional quando necessário;
* definir fallback;
* documentar backfill;
* adicionar teste com documento legado.

Não executar migração automática destrutiva.

Scripts de migração devem ser:

* idempotentes;
* revisáveis;
* executados fora de produção primeiro;
* acompanhados de relatório.

## UX

Não fazer redesign durante correções de lógica.

Para ações críticas, garantir:

* loading;
* prevenção de toque duplo;
* confirmação;
* mensagem de sucesso;
* mensagem de erro amigável;
* preservação segura dos dados digitados;
* bloqueio antecipado quando possível.

Não exibir erro cru do Firebase ao usuário.

Erros técnicos podem ser registrados no console apenas em desenvolvimento.

## Relatório após alterações

Ao concluir cada bloco, informar:

1. Arquivos alterados exclusivamente no bloco.
2. Comportamento anterior.
3. Novo comportamento.
4. Testes adicionados.
5. Resultado de typecheck.
6. Resultado de lint.
7. Resultado de Jest.
8. Resultado dos testes de Rules.
9. Testes manuais realizados.
10. Testes manuais pendentes.
11. Riscos restantes.
12. Itens não implementados por estarem fora do escopo.

Não declarar teste manual realizado quando não houver device, emulador ou ambiente disponível.

## Pendências conhecidas antes de produção

* Backfill de `team_memberships`.
* Backfill ou recálculo de contadores legados.
* Manutenção de `registeredTeamsCount` em rejeição, remoção e arquivamento.
* Validação manual da correção de partidas em dispositivo.
* Testes diretos completos de `applyMatchCorrection`.
* Reprocessamento de campeonatos definitivamente encerrados.
* Revisão das dependências reportadas pelo `npm audit`.
* Limpeza gradual dos warnings de lint.
* Warning histórico da `SeasonScreen`.
* Testes E2E da jornada real com Firebase de desenvolvimento.

Não remover esta lista sem corrigir e validar cada item.
