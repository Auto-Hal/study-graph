import { createManifestAssetProvider } from "@/src/lib/review/assets/provider";
import type { ReviewAssetManifestEntry } from "@/src/lib/review/assets/provider";

// Small, explicitly licensed pilot set. Assets remain remote references so this
// phase does not introduce a storage migration or duplicate third-party files.
export const reviewAssetManifest = [
  {
    projectId: "western-art-history",
    itemId: "3bdd2793-4134-81b4-b386-d872b3aedec5",
    asset: {
      type: "image",
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Venus_of_Willendorf_2017.jpg/500px-Venus_of_Willendorf_2017.jpg",
      alt: "ヴィレンドルフのヴィーナス",
      width: 500,
      height: 889,
      presentation: "full",
      caption: "ヴィレンドルフのヴィーナス",
      attribution: "Syd Storm / Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Venus_of_Willendorf_2017.jpg",
      license: "CC0 1.0",
    },
  },
  {
    projectId: "western-art-history",
    itemId: "3c5d2793-4134-8154-94d5-d9d86589916c",
    asset: {
      type: "image",
      src: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Image_of_Stonehenge.jpg/960px-Image_of_Stonehenge.jpg",
      alt: "ストーンヘンジ",
      width: 960,
      height: 720,
      presentation: "full",
      caption: "ストーンヘンジ",
      attribution: "Ammo18 / Wikimedia Commons",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:Image_of_Stonehenge.jpg",
      license: "CC BY-SA 4.0",
    },
  },
] satisfies readonly ReviewAssetManifestEntry[];

export const reviewAssetProvider = createManifestAssetProvider(reviewAssetManifest);
