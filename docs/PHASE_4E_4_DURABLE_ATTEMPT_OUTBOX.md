# Phase 4E-4 Durable Attempt Outbox

Phase 4E-4 makes the versioned Kuzushiji pilot answer durable before it is
sent over the network. It does not change the Review scheduler, grading, Scope
recheck, Objective SRS, or legacy writer. There is no SRS semantics change.

## Authority boundary

The browser keeps a replica of server-issued data. Git remains the authority
for revision and grader content, Supabase remains the authority for accepted
attempts and receipts, and Notion remains the read-only Scope authority. An
IndexedDB record is transport durability, never a Scope, grading, learner, or
SRS authority. Client correctness is provisional feedback only.

## Durable-before-send

The pilot path creates one UUID and one immutable submission, computes the
existing Phase 4C request hash (attemptId, instanceId, rawAnswer,
selfEvaluation, responseMs, usedHint), and commits it to the separate
`study-graph-attempt-outbox` IndexedDB database before issuing `POST
/api/review/pilot/attempt`. Timestamps, snapshot claims, and retry metadata
are excluded from that hash. If the local transaction fails, transport and
card advancement stop; there is no localStorage fallback.

The database is version 1 with `attempt_outbox` (keyPath `attemptId`, unique
`instanceId` index) and `attempt_receipts` (keyPath `attemptId`). Submission
fields are never edited after pending. Only transport metadata and the
state-machine status can change.

## Delivery and receipt authority

An authoritative server receipt is validated by the Phase 4E-1 parser and is
stored together with the terminal outbox state in one IndexedDB transaction.
The UI reports `accepted` only after that transaction completes. A network,
5xx, or 429 result returns the record to `pending`; a 401 uses
`auth-required`. While `auth-required`, the transport first probes the
authenticated read-only receipt route: a 401, network failure, 429, or 5xx
keeps `auth-required`; a 404 proves the session and permits the transition
back to `pending`; a complete stored receipt can finish the attempt without a
POST. An `attempt_conflict` or an incomplete receipt is `blocked`.
`instance_already_answered` first requires the authenticated receipt lookup;
the lookup must include and match the immutable request hash and attempt ID.
The current request is never used to repair or fill a stored receipt. The
read-only `GET /api/review/pilot/receipt` route returns the server-derived
receipt kind and does not grade, read Notion, or update SRS.

Sending records are recovered to pending on reload. Pending records from older
sessions remain addressable by their original instance and attempt IDs. Flush
is attempted on session mount, `online`, and visibility becoming `visible`;
there is no Background Sync or polling. Accepted and blocked records are
terminal and are never rewound or deleted.

## UI and rollback

Pilot results distinguish terminal server acceptance from
`端末保存済み・未同期`, `ログイン待ち`, and records requiring confirmation.
Auth-required results link to `/login`; blocked records remain durable and are
reported as requiring confirmation without automatic retry. Non-pilot Review
continues to use the existing legacy endpoint. A pending answer is never
silently sent through that legacy endpoint.

To roll back, stop creating new pilot outbox submissions and disable the pilot
runtime entry only after the new writer is disabled. Keep pending records and
accepted receipts for retry/audit; do not delete IndexedDB history or change
Supabase rows. Existing legacy Review remains available for non-pilot cards.

Phase 4E-5 may add explicit foreground retry/auth UX. It owns no new SRS
semantics, instance issuance, asset cache, service worker, or offline app
shell in this phase.
