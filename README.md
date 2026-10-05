# FJU Championship

Aplicativo mobile para gerenciamento de campeonatos esportivos da FJU (Tribo de Judá), feito com React Native e Expo. Cobre todo o ciclo de um campeonato: inscrição de times, elenco, tabela de jogos, partidas ao vivo, classificação, estatísticas e premiações.

- **Versão:** 1.2.0
- **Android package:** `com.fjutribodejuda.championship`

## Perfis de usuário

| Perfil | O que faz |
| --- | --- |
| **Organizador** | Cria e gerencia campeonatos, aprova times, gera rodadas e chaveamento, conduz e corrige partidas, publica comunicados. |
| **Capitão** | Inscreve o time, gerencia elenco, convites e solicitações, faz convocações. |
| **Atleta** | Entra em times, acompanha jogos, confirma presença, vota no craque da rodada, vê carreira e conquistas. |

> O papel de organizador depende da coleção `organizer_allowlist/{uid}` no Firestore. Nenhuma variável `EXPO_PUBLIC_*` concede permissão.

## Principais recursos

- Criação e gerenciamento de campeonatos (pontos corridos, mata-mata e fase de grupos + mata-mata)
- Inscrição e aprovação de times, com limites de `maxTeams` e `maxPlayers`
- Gestão de elenco, convites e solicitações de entrada
- Geração de rodadas e chaveamento (com byes para quantidades que não são potência de 2)
- Partidas ao vivo e finalizadas, com gols, assistências e cartões
- W.O., adiamento e cancelamento de partidas
- Correção controlada de partidas finalizadas, com log de auditoria imutável
- Classificação com critérios de desempate e mini-tabela
- Estatísticas, suspensões e convocações com presença
- Votação de craque da rodada
- Notificações, comunicados e Central de Pendências
- Perfil, carreira, conquistas e Hall da Fama

## Stack

- React Native 0.85 + Expo SDK 56 + TypeScript
- Zustand (estado global)
- Firebase Authentication, Firestore e Storage
- Jest e Firebase Emulator Suite (testes unitários, de serviços e de Rules)
- ESLint
- Maestro (E2E)

O projeto **não usa Cloud Functions**. Toda a lógica roda no cliente, protegida pelas Firestore/Storage Rules.

## Estrutura

```text
src/
  screens/      Telas (auth, championship, home, match, onboarding, organizer, player, stats, team)
  components/   Componentes de UI reutilizáveis
  services/     Regras de negócio, persistência e integrações (Firebase)
  stores/       Estado global (Zustand)
  hooks/        Composição e sincronização em tempo real
  utils/        Funções puras e regras testáveis
  types/        Contratos e modelos
  navigation/   Navegação
  mocks/        Dados e comportamento do modo demonstração
  config/       Configuração do app e ambiente
  __tests__/    Testes Jest
rules/          Testes de Firestore e Storage Rules
scripts/        Seed, auditoria e migração de dados
docs/           Documentação técnica
.maestro/       Fluxos E2E
firestore.rules / storage.rules
```

## Começando

### Pré-requisitos

- Node.js e npm
- Java (necessário para o Firebase Emulator)
- Android Studio / emulador Android ou o app Expo Go em um dispositivo
- Maestro (opcional, apenas para E2E)

### Instalação

```bash
npm install
cp .env.example .env
```

### Variáveis de ambiente

Veja `.env.example`. As principais:

| Variável | Descrição |
| --- | --- |
| `EXPO_PUBLIC_APP_ENV` | Ambiente (`development`, staging ou produção). |
| `EXPO_PUBLIC_USE_FIREBASE_EMULATOR` | `true` apenas em desenvolvimento. Deve ser `false` em staging e produção. |
| `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` | IP da máquina ao usar dispositivo físico. |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | `fju-operational-emulator` (local), projeto de staging ou `fju-championship` (produção). |
| `EXPO_PUBLIC_USE_MOCK` | `true` ativa o modo demonstração. O padrão é Firebase real. |

Mais detalhes em [docs/security-and-env.md](docs/security-and-env.md).

### Rodando com o Emulator

```bash
npm run dev:prepare      # sobe os emuladores e carrega os dados de teste
npm run emulators:start  # mantém os emuladores rodando
npm start                # inicia o Expo
npm run android          # build e execução no Android
```

Guia completo em [docs/local-emulator-setup.md](docs/local-emulator-setup.md).

### Modo mock

Com `EXPO_PUBLIC_USE_MOCK=true` o app roda sem Firebase, com dados de demonstração que reproduzem as principais regras do backend.

## Scripts

| Comando | Descrição |
| --- | --- |
| `npm start` | Inicia o Expo. |
| `npm run android` / `ios` / `web` | Executa na plataforma escolhida. |
| `npm run typecheck` | Verificação de tipos (`tsc --noEmit`). |
| `npm run lint` | ESLint. |
| `npm test` | Testes Jest. |
| `npm run test:rules` | Testes das Firestore/Storage Rules no Emulator. |
| `npm run e2e` | Testes E2E com Maestro. |
| `npm run audit:data` | Auditoria de dados legados. |
| `npm run migrate:data:dry` / `migrate:data` | Backfill de dados (simulação / aplicação). |
| `npm run verify` | Verificação de build. |

## Qualidade

Antes de considerar qualquer alteração concluída, execute:

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run test:rules
```

Para mudanças localizadas, rode antes os testes focados, por exemplo `npm test -- roundRobin --runInBand`.

## Segurança e integridade dos dados

- Ações administrativas são validadas também nas Firestore Rules, nunca apenas na interface.
- O vínculo usuário-time é `team_memberships/{teamId}_{uid}`.
- `approvedPlayersCount` e `registeredTeamsCount` são caches serializados por transação e nunca ficam negativos.
- Operações críticas são transacionais, idempotentes e seguras em retry.
- Partidas finalizadas só mudam pelo serviço de correção controlada, com log em `match_corrections/{correctionId}`.
- Uploads no Storage são restritos por dono, caminho, tipo e tamanho.

## Documentação

- [Setup local com Emulator](docs/local-emulator-setup.md)
- [Segurança e ambientes](docs/security-and-env.md)
- [Formato grupos + mata-mata](docs/groups-knockout-format.md)
- [Pipeline de ações de notificação](docs/notification-action-pipeline.md)
- [Reprocessamento de campeonatos](docs/championship-reprocessing.md)
- [Guia de migração de dados](docs/data-migration-guide.md)
- [Validação operacional](docs/operational-validation-report.md)
- [Pendências pré-produção](docs/pre-production-pending.md)

Diretrizes de contribuição e regras de trabalho do projeto estão em [CLAUDE.md](CLAUDE.md).

## Licença

Veja [LICENSE](LICENSE).
