# Phase 5A-3c: Western Philosophy multi-Objective registry

The trusted server registry orders three Git-owned, text-only Objectives: Thales, Anaximander, and Anaximenes. Each has Exercise/Objective version 1 and SRS epoch 1. The existing Anaximander immutable content and hashes are unchanged.

| Objective | Notion Scope subject | Revision contentHash | Release manifestHash | Objective contentHash |
| --- | --- | --- | --- | --- |
| `philosophy.thales.arche-recall` | `3bdd2793-4134-819f-811b-e90baae5becc` | `912c2a4ef680477847ea3b801fce9e569e6b6f73c980980dd88cf1885a0424d1` | `9a0027343407db622e87a6eaa64fcf8fb7f5e6e9df3d8f84a81f53f16a81ccaa` | `2d4b2c056a5bee927d426faa165b34da1994578bc860efda02be63a8fc9a5697` |
| `philosophy.anaximander.arche-recall` | `3bdd2793-4134-81db-bc14-cbb389912018` | `e447af0932b075e2b57cc6ce200cfc499ef4f6dd002196ee4ceb9a9bbfc27318` | `d16990dd6dc12cbca7187f10e626f520c9bace8572fa94a02c2bad1ce0f1e064` | `03b0197db1ca4ce1ef90301035715c412d8cc49f98ef78d438c490276d86652f` |
| `philosophy.anaximenes.arche-recall` | `3bdd2793-4134-811e-8788-c051a60154fb` | `8890890620cf98838bf698af8fb5cf7bbc3f52a4d54c42e2e40f5234c5233898` | `53e994bdad3c2e75b3c4e6f733eb0b89f5f07fe2d591e43eee150377a7376c3a` | `2f8b7edbf67b766f877792213c36f5f5fab1ac9d636b617e92f1d4d6272c0b78` |

The existing Philosophy flag remains the only curriculum rollout selector and enables issuance only for exact `true` alongside the global Objective v2 flag. While enabled, all three Scope subjects are removed from legacy scheduling before due/unseen selection. The server builds Scope once, attempts DB-authoritative scheduled issuance independently for each eligible entry, and prepends successful persisted cards in registry order within the existing session size. A not-due result or issuer error never falls back to legacy for that subject or suppresses another Objective.

At first acceptance, the server selects only a registered Exercise through the learner-owned persisted instance. It grades the persisted immutable revision, re-reads fresh Notion Scope for that entry's subject, and checks its trusted epoch; the v2 database writer remains SRS authority. Accepted retries still recover the stored Receipt first. The six-field request hash, outbox, Kuzushiji behavior, and offline protocol are unchanged.

This implementation does not alter Production flags or data. No migration is added. Production rollout requires a separate approval.
