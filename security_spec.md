# Security Specification — Anime Guess Scores

## 1. Data Invariants
- Every document in `/scores/{scoreId}` must contain strictly the 5 keys: `name`, `score`, `game`, `mode`, `createdAt`. No extra shadow fields are permitted.
- `name` must be a non-empty string (`1 <= length <= 40`).
- `score` must be an integer within `[0, 2000]`.
- `game` must strictly equal `'Anime Guess'`.
- `mode` must be one of `'Emoji'`, `'Anime'`, or `'Баатар'`.
- `createdAt` must strictly equal `request.time` (server timestamp).
- Score entries are immutable after creation: `update` and `delete` are denied for all clients.
- Document IDs must match `^[a-zA-Z0-9_\-]+$` with length `<= 128`.
- No PII (`email`, `phone`, `address`) is stored in `/scores`.

## 2. Adversarial Payloads ("Dirty Dozen")
1. Missing required key (`{ name: "Player", score: 20, game: "Anime Guess", mode: "Emoji" }`) -> DENIED
2. Shadow/extra field (`{ name: "Player", score: 20, game: "Anime Guess", mode: "Emoji", createdAt: serverTimestamp, isAdmin: true }`) -> DENIED
3. Empty name (`name: ""`) -> DENIED
4. Oversized name (`name: "A".repeat(41)`) -> DENIED
5. Negative score (`score: -10`) -> DENIED
6. Inflated score (`score: 999999`) -> DENIED
7. Non-integer score (`score: "100"`) -> DENIED
8. Invalid game string (`game: "Other Game"`) -> DENIED
9. Invalid mode string (`mode: "HackMode"`) -> DENIED
10. Spoofed client timestamp (`createdAt: new Date(0)`) -> DENIED
11. Attempting to update an existing score -> DENIED
12. Attempting to delete an existing score -> DENIED
