import OfflineKuzushijiReview from "@/src/components/OfflineKuzushijiReview";

export const dynamic = "force-dynamic";

/**
 * Dedicated cold-start shell. The client reconstructs the card from local
 * IndexedDB/Cache Storage only; this server page does not read Notion or
 * Supabase and is safe to serve from the prepared app-shell cache.
 */
export default function OfflineReviewPage() {
  return <OfflineKuzushijiReview />;
}
