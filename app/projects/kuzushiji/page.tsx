import KuzushijiSnapshotDashboard from "@/src/components/KuzushijiSnapshotDashboard";

export const dynamic = "force-dynamic";

/**
 * The normal Kuzushiji dashboard is snapshot-backed. Review and detail
 * routes retain their existing authorities and are intentionally separate.
 */
export default function KuzushijiProjectPage() {
  return <KuzushijiSnapshotDashboard />;
}
