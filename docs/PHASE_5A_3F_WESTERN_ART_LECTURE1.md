# Phase 5A-3f — Western Art History Lecture 1 Objective expansion

The trusted Western Art Objective registry now contains, in order, Paleolithic / 旧石器時代, Exaggeration / 誇張, Abstraction / 抽象化, Menhir, Dolmen, Cromlech, and Trilithon. Each Objective has independent v2 database scheduling. The new entries use deterministic `legacy-text-v1` grading with `review-session-ja-v1` normalization; there is no image, hint, choice answer, or runtime model call.

The three new revisions cite [Lecture 1](https://app.notion.com/p/3bdd2793413481058e0fc17980f50ec8) and their respective [旧石器時代](https://app.notion.com/p/3bdd279341348147a3eed727377661ff), [誇張](https://app.notion.com/p/3bdd2793413481ccb045fa1e1c7b7ddd), and [抽象化](https://app.notion.com/p/3bdd2793413481cbaabbc687e1b808ba) pages. Git owns the immutable grading answers. Current Notion graph data supplies Scope only: a direct Lecture 1 relation and a valid lecture date no later than the current Tokyo date are required. No Lecture 3 Objective or inferred Lecture 3 Scope is included.

| Objective | Revision content hash | Release manifest hash | Objective content hash |
| --- | --- | --- | --- |
| Paleolithic | `eb55d0e08bf4e0495b310a56f45878a8e59930988b72a99b779d5e85fd868745` | `9ea5a3e5a3d98ce07f43a725043327294e2fae52176268ccd8ec088ff57527e3` | `172f5c4ab568b5fbbe7108f8b7820293093fcc8738027977ae5b75abbbf27632` |
| Exaggeration | `d047eb7baa5f3613bbdddf6da1fd148dbf64685fa0d06289117be57d0d3c6ca6` | `44569d8b42aec86a68f33009306210f6242dcb7ba1a06b6172c1a9b6896eee17` | `0871e4790ea1cd49821958a3a6b2630911a29b83569de47649239bd1188f6dbf` |
| Abstraction | `5b7235c2351098ece56bdddb429db49d2c38f6bf1aec6f38556e7e58c26d5354` | `352b09740f46ed44b898515d09b06695bbb5ff38f0dc67f0cd87ea7f26a6ccd8` | `b9bf236b70da1aef1f1d398169911589236090f123c974582df07844450b7ea1` |

The four existing Lecture 2 immutable hash triples remain pinned in the Phase 5A-3f regression test and are unchanged. The registry's seven Scope subjects are excluded from legacy due/unseen selection whenever the existing Art rollout flag is exactly `true`. Eligible Objective cards are issued independently, rendered from their persisted archive on reuse, placed before legacy cards, and capped by the existing session size. First acceptance grades that persisted revision and reads fresh Western Art Scope. Accepted retries recover Receipt v2 before grading, routing, Scope, or epoch evaluation. The existing Objective writer remains the final SRS authority.

The existing `STUDY_GRAPH_WESTERN_ART_HISTORY_PILOT_ISSUANCE_ENABLED` flag is already on in Production. This implementation does not change the flag or Production deployment. After merge, the Supervisor must verify the exact merged main, CI, and Production deployment before opening Western Art Review for a controlled canary. The three new Lecture 1 Objectives may then issue as unseen, subject to independent database authority. No migration or offline protocol change is involved.
