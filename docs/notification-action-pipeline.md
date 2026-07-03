# Bloco 9 - Notification action pipeline

## Contrato v1

Payload principal:

```json
{
  "v": 1,
  "type": "match_prematch",
  "actionId": "unique-action-id",
  "expiresAt": 1782921900000,
  "championshipId": "championship-id",
  "matchId": "match-id"
}
```

Regras:

- `actionId` identifica consumo unico da acao.
- `expiresAt` limita replays e pending actions antigas.
- Dados sensiveis nao devem entrar no payload.
- Payload legado e deep links passam pelo mesmo parser/normalizador.
- Tipo desconhecido ou entidade insuficiente cai em fallback seguro.

## Pipeline unico

Notificacoes, NotificationCenter e deep links usam a mesma sequencia:

1. parse
2. normalize
3. validate
4. check expiration
5. check permission
6. resolve destination
7. prepare context
8. navigate
9. consume action

## Gates

Nao usar `setTimeout` para aguardar estado essencial. O orquestrador reprocessa em memoria quando estes gates mudam:

- `authReady`
- `navigationReady`
- `storesReady`
- `contextReady`

## Validacao

Testes automatizados cobrem parser, legado, deep links, listeners, singleton, cleanup, deduplicacao e expiracao.

Push remoto real nao deve ser declarado validado sem development build em device fisico ou emulador compativel.
