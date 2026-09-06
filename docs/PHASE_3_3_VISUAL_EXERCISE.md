# Phase 3.3 — Visual Exercise / Asset foundation

## Scope

Phase 3.3 establishes an asset abstraction for Review exercises without choosing an irreversible image source, storage provider, or licensing model.

## Implemented

- `ReviewAsset` supports image source, intrinsic dimensions, normalized crop region, full/crop presentation, caption, attribution, source URL, and license metadata.
- `ExerciseAsset` renders both full images and cropped regions using the same Review UI.
- Crop coordinates are normalized to the source image (`x`, `y`, `width`, `height` in the `0..1` range), so stored regions are resolution-independent.
- Invalid crop metadata falls back to full-image rendering instead of failing the Review session.
- `/review/asset-demo` validates the end-to-end image/crop UI with a generated synthetic image and fallback persistence. It does not use copyrighted external material and does not write review rows.
- Existing Review cards, Notion adapters, Supabase review rows, RPCs, and scheduling behavior are unchanged.

## Deliberately deferred

The following are localized product/data decisions and do not block the code foundation:

1. Source of real Kuzushiji images: public-domain/open collections, user-owned scans/photos, or another approved source.
2. Storage: remote source URLs, Supabase Storage, repository assets, or another managed store.
3. Licensing/attribution policy for each external collection.
4. Authoring workflow for crop regions.

No Supabase Storage bucket, Notion write, destructive migration, or external image acquisition is introduced in this phase.

## Next safe work

- Add a provider/manifest layer that maps a knowledge node or character ID to `ReviewAsset` metadata.
- Once an approved source is chosen, ingest a small pilot set of licensed/public-domain Kuzushiji assets.
- Add authoring/preview tooling for normalized crop regions before scaling the asset set.
