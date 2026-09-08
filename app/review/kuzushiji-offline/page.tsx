import OfflineKuzushijiReview from "@/src/components/OfflineKuzushijiReview";

export const dynamic = "force-dynamic";

/** The app shell is already loaded; Phase 4E-6 will cover cold-start offline. */
export default function KuzushijiOfflineReviewPage() {
  return <OfflineKuzushijiReview />;
}

