# Phase 4D-3 — Kuzushiji legacy migration audit

Phase 4D-3 is a read-only audit of whether the existing legacy Kuzushiji SRS state can be safely seeded into the narrow Objective `kuzushiji.a.eitaigura-u3042-00032-1.read`.

The audited legacy character state combines three historical events with different evidence quality: an older generic character review without versioned exercise/answer/correctness metadata, a generic visual-reading attempt, and the current fixed Eitaigura visual-reading revision. This does not prove one-to-one semantic equivalence with the fixed-glyph, short-answer recall Objective.

Decision: **do not seed legacy state into Objective SRS**. Preserve all existing legacy history and state unchanged. Objective epoch 1 starts uninitialized and is created only by the first accepted post-cutover Objective attempt.

This audit performs no database migration, no backfill, no Notion write, and no deletion or reset of legacy state.
