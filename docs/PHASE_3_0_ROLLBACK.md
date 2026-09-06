# Phase 3.0 Rollback Boundary

Application rollback can revert the Review provider changes without deleting learning data. The Supabase `knowledge` kind allowance is backward-compatible and may remain even if application code is rolled back; it does not change existing Character / Mistake rows.
