# Security and environment contract

## Public Expo variables

`EXPO_PUBLIC_USE_MOCK` is the single environment variable for demo/mock mode.
The shorter name was chosen to avoid carrying older mock-data wording as an
environment contract and to make the value clearly Expo-public.

Expo inlines `EXPO_PUBLIC_*` variables into the client bundle. For that reason,
`EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN` is UI-only and must never be treated as
authorization. It can expose the organizer option during local development, but
Firestore Rules still require `organizer_allowlist/{uid}` for a user to save
`role: "organizador"`.

## Organizer allowlist

Organizer onboarding without Cloud Functions uses:

`organizer_allowlist/{uid}`

Required fields:

- `uid`: the same uid as the document id.
- `enabled`: `true`.

A normal user can read only their own allowlist document and cannot create or
edit it. Existing organizers can maintain the allowlist. The first organizer
must be bootstrapped outside the client, for example through the Firebase
console, Firebase Admin SDK, or emulator seed data. The bootstrap write must
create `organizer_allowlist/{uid}` with `uid` equal to the document id and
`enabled: true`; no client screen is allowed to grant the first organizer role
by itself.

Allowlist maintenance is restricted to already authorized organizers according
to Firestore Rules. They may create a new allowlist entry, update its metadata,
or disable it. Regular authenticated users may only read their own entry and
cannot create, update, or re-enable allowlist documents.

To revoke organizer access, update the target allowlist document to
`enabled: false` or remove the document, then ensure the user's profile no
longer depends on `role: "organizador"` for access. Rules treat the allowlist as
the authority for organizer self-assignment, so disabling the entry prevents the
user from assigning or keeping organizer privileges through the client flow.

## Team announcements

Team-specific announcements do not depend on `users.teamId`. That field is not
updated consistently by every roster flow and may be cleared when the athlete
leaves a team.

The readable association is:

`team_memberships/{teamId}_{uid}`

Active statuses are any status except `sem_time` and `removido`. The app writes
this index when a user joins by invite code or when a captain approves a request,
and marks it inactive when the player leaves or is removed.

Legacy data that has active `players` documents but no `team_memberships`
document needs a one-time backfill before team-specific announcements are fully
available to those users.

Expected backfill format:

`team_memberships/{teamId}_{userId}`

Required fields:

- `teamId`: team id from the active player record.
- `userId`: athlete user id from the active player record.
- `championshipId`: championship id from the active player record.
- `status`: active roster status, normally `ativo`, `suspenso`, or `lesionado`.
- `active`: `true`.
- `updatedAt`: migration timestamp.

The later migration script should be idempotent: scan legacy `players` records,
ignore statuses that do not reserve a roster slot (`sem_time` and `removido`),
derive the deterministic membership id, create the document when missing, and
merge/update only compatible fields when it already exists. Do not run this
backfill automatically during app startup or deployment.
