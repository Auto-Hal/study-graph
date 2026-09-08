import OfflineKuzushijiReview from "@/src/components/OfflineKuzushijiReview";

export const dynamic = "force-dynamic";

/** Authenticated compatibility route; cold-start uses /offline-review. */
export default function KuzushijiOfflineReviewPage() {
  return <OfflineKuzushijiReview />;
}
