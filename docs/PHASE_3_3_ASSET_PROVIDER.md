# Phase 3.3 — Asset Provider / Manifest layer

## Purpose

Keep Review exercises independent from image storage and source-specific schemas. A Review card identifies the learning item/exercise; an asset provider may then attach a licensed image and optional normalized crop without changing the Review UI.

## Provider contract

`ReviewAssetProvider.resolve()` receives:

- `projectId`
- `itemId`
- `exerciseId`

and returns a `ReviewAsset` or `undefined`.

The manifest provider supports both item-level and exercise-level mappings. Exercise-specific mappings take precedence over item-level defaults. This allows one knowledge node or Kuzushiji character to have multiple visual exercises/crops.

`attachReviewAssets()` decorates Review cards additively and never replaces an asset already supplied by a project adapter.

## Production manifest safety

`src/lib/review/assets/manifest.ts` is intentionally empty until a real image source, license policy, and storage strategy are approved. This prevents source/storage choices from becoming implicit architecture decisions.

The synthetic `/review/asset-demo` now uses the same provider/manifest mechanism, proving the lookup path without external images or persistence writes.

## Localized blocker before real Kuzushiji assets

A pilot image set requires a decision on:

1. approved source(s) and licensing/attribution requirements;
2. remote-source URLs vs managed storage;
3. whether user-owned museum/reference photos are allowed and how they are handled;
4. crop authoring workflow.

These choices do not block further UI, provider, validation, or offline/field-mode foundation work.
