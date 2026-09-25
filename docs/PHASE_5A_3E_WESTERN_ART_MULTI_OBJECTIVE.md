# Phase 5A-3e: Western Art multi-Objective registry

The trusted server registry issues scheduled Objective v2 instances for four Lecture 2 terms in curriculum order: Menhir, Dolmen, Cromlech, Trilithon. Each uses its own Notion term page only for current Scope eligibility. Git-owned revision content supplies the answer and deterministic grader. The existing Art rollout flag must equal lowercase `true`, and the global Objective v2 issuance flag must also be enabled. Neither flag selects the acceptance writer for an already issued instance.

When Art Objective authority is selected, all four registered term IDs are removed from legacy scheduling before due or unseen selection. Each Scope-eligible Objective is issued independently under the database's due and active-opportunity rules. A not-due result or failure for one term produces no card and no legacy fallback for that term. Returned instances are resolved to their persisted immutable archive before display; issued cards precede remaining legacy cards, capped by the existing session size.

The six-field durable attempt remains unchanged. Receipt recovery precedes persisted project routing. On first acceptance, persisted project and registered exercise ID choose the trusted entry, the immutable revision is graded, and a fresh Western Art graph supplies that entry's Scope decision. The generic Objective v2 writer alone decides SRS application. No new database migration, offline prefetch, outbox format, or runtime grading strategy is introduced.

| Objective | Revision `contentHash` | Release `manifestHash` | Objective `contentHash` |
| --- | --- | --- | --- |
| Menhir | `0a3f0aafad6441b5754d0304db84daf688bd2187ef34dafe8b8beaeec8994fc0` | `056d17d96abbd802801d662708bbf91855736449d97f91c0182a0be40773232c` | `406cbef1ff048e75d4cf5266689467a74fef5ffb81b9cb87a5df2ac594382e9c` |
| Dolmen | `3e282a78882fc4c0816fbdd650afbdf31df62d0b51384aa46b27f1324ef68a4b` | `8accad42a2e7d9e048fb02ab506ea81940a051c52e0ffa05a27f5e64ffee49cb` | `bd37811d9a6e7e46bca3a908b8d7672cba58f784eae5e7bbf8c65fa741f59764` |
| Cromlech (unchanged) | `45f396e0c74c6f725c4ecf200bd05d310d18690860e90a84f6f91fded43666a2` | `12d874ecfd9fb2416b932f5efba77799bad2ccbe9616988d141c922456180fc8` | `1d9c10b837b2a7ed91a7458221ad0dcdb23c73abfcee6758e0820800b352fbf5` |
| Trilithon | `1ab7c95f1da0cde7d3be95bcbba0f000adc33abbad596891e7b21fecc0bdf2d4` | `8f134dc8be07d4de83c2cef5a4b5ef6fa728d7e49724a81ab5d9d076f6b42a1a` | `61a3a44f3dd5b05c671036460c4953f156630e0dad9e67b98d51bc480b761e9f` |

The Art flag is already on in Production. Merging this code is not a canary authorization. Before opening Production Western Art Review after deployment, Supervisor must verify the exact main CI and Production deployment SHA and create a separate controlled multi-Objective canary. Existing v2 attempts must remain recoverable if the Art flag is turned off.
