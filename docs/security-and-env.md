# Security and environment contract

## Public Expo variables

`EXPO_PUBLIC_APP_ENV` is required and must be one of:

- `development`
- `staging`
- `production`

`EXPO_PUBLIC_USE_FIREBASE_EMULATOR` is required and must be explicitly `true`
or `false`.

Rules:

- `development` can use Firebase Emulator.
- `staging` must use a staging Firebase project and cannot use Emulator.
- `production` must use the production Firebase project and cannot use
  Emulator.
- `development` without Emulator cannot point to the production project
  `fju-championship`.
- Invalid combinations fail during app initialization with a fatal
  configuration error.

`EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` is optional. Leave it blank for web
localhost or Android Emulator auto-resolution. Set it to the computer LAN IP
when testing on a physical device.

Do not put secrets in `EXPO_PUBLIC_*`. Firebase client identifiers are public
configuration, not credentials.

`EXPO_PUBLIC_USE_MOCK` is the single environment variable for demo/mock mode.
The shorter name was chosen to avoid carrying older mock-data wording as an
environment contract and to make the value clearly Expo-public.

Expo inlines `EXPO_PUBLIC_*` variables into the client bundle. For that reason,
`EXPO_PUBLIC_ALLOW_ORGANIZER_SELF_ASSIGN` is UI-only and must never be treated as
authorization. It can expose the organizer option during local development, but
Firestore Rules still require `organizer_allowlist/{uid}` for a user to save
`role: "organizador"`.

## Firebase Emulator

Local manual validation uses one explicit emulator project:

`fju-operational-emulator`

Configured services:

- Auth Emulator: `9099`
- Firestore Emulator: `8080`
- Storage Emulator: `9199`

The client connects to all three services only when
`EXPO_PUBLIC_APP_ENV=development` and
`EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true`.

Host resolution:

- Web/desktop: `127.0.0.1`
- Android Emulator: `10.0.2.2`
- Physical device: set `EXPO_PUBLIC_FIREBASE_EMULATOR_HOST` to the machine LAN
  IP.

The app shows a small non-production badge (`DEV EMULATOR`, `DEVELOPMENT`, or
`STAGING`) so manual testers can see that the app is not running as production.

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
