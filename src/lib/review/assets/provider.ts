import type { ReviewAsset, ReviewCard } from "@/src/lib/review/types";

export type ReviewAssetLookup = {
  projectId: string;
  itemId: string;
  exerciseId: string;
};

export type ReviewAssetManifestEntry = {
  projectId: string;
  itemId?: string;
  exerciseId?: string;
  asset: ReviewAsset;
};

export type ReviewAssetProvider = {
  resolve: (lookup: ReviewAssetLookup) => ReviewAsset | undefined;
};

function matches(entry: ReviewAssetManifestEntry, lookup: ReviewAssetLookup) {
  if (entry.projectId !== lookup.projectId) return false;
  if (entry.exerciseId && entry.exerciseId !== lookup.exerciseId) return false;
  if (entry.itemId && entry.itemId !== lookup.itemId) return false;
  return Boolean(entry.exerciseId || entry.itemId);
}

function specificity(entry: ReviewAssetManifestEntry) {
  return Number(Boolean(entry.exerciseId)) * 2 + Number(Boolean(entry.itemId));
}

export function createManifestAssetProvider(entries: readonly ReviewAssetManifestEntry[]): ReviewAssetProvider {
  const ordered = [...entries].sort((a, b) => specificity(b) - specificity(a));
  return {
    resolve(lookup) {
      return ordered.find((entry) => matches(entry, lookup))?.asset;
    },
  };
}

export function attachReviewAssets(cards: ReviewCard[], provider: ReviewAssetProvider) {
  return cards.map((card) => {
    if (card.asset) return card;
    const asset = provider.resolve({
      projectId: card.projectId,
      itemId: card.id,
      exerciseId: card.exerciseId,
    });
    return asset ? { ...card, asset } : card;
  });
}
