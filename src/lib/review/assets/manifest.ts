import { createManifestAssetProvider } from "@/src/lib/review/assets/provider";
import type { ReviewAssetManifestEntry } from "@/src/lib/review/assets/provider";

// Production-safe by design: real assets are added only after source/license/storage
// decisions are explicit. Keeping this manifest empty prevents accidental external
// acquisition or implicit persistence choices.
export const reviewAssetManifest = [] satisfies readonly ReviewAssetManifestEntry[];

export const reviewAssetProvider = createManifestAssetProvider(reviewAssetManifest);
