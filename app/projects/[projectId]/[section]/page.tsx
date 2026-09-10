import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { isRenderableProjectReadState, loadProjectReadState, projectReadStateToGraph } from "@/src/lib/projects/read-runtime";
import { getWorkspaceProject, getWorkspaceSection, learnerGraphMeta } from "@/src/lib/projects/workspace";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspaceSectionPage({
  params,
}: {
  params: Promise<{ projectId: string; section: string }>;
}) {
  const { projectId, section: sectionSlug } = await params;
  const workspace = getWorkspaceProject(projectId);
  const section = getWorkspaceSection(projectId, sectionSlug);
  if (!workspace || !section) notFound();

  const readState = await loadProjectReadState(workspace.id);
  const renderable = isRenderableProjectReadState(readState);
  const graph = renderable ? projectReadStateToGraph(readState) : null;
  const nodes = graph?.nodes.filter((node) => node.kind === section.kind) ?? [];

  return (
    <main className="phase5-shell phase5-deep-shell phase5-workspace-shell">
      <AppHeader context={`${workspace.shortLabel} · ${section.label}`} backHref={`/projects/${workspace.id}`} backLabel={workspace.shortLabel} />

      <div className="phase5-context-nav" aria-label="現在地">
        <Link href="/projects">学ぶ</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/projects/${workspace.id}`}>{workspace.title}</Link>
        <span aria-hidden="true">›</span>
        <span>{section.label}</span>
      </div>

      <section className="phase5-page-heading phase5-deep-heading">
        <div>
          <p className="phase5-eyebrow">{workspace.shortLabel}</p>
          <h1 className="phase5-page-title">{section.label}</h1>
          <p className="phase5-context">{workspace.context}</p>
        </div>
        {renderable && <span className="phase5-deep-count">{nodes.length}件</span>}
      </section>

      {!renderable ? (
        <section className="phase5-deep-unavailable" role="status" aria-live="polite">
          <h2>学習データを表示できません</h2>
          <p>この一覧は現在利用できません。学習状況を確認できたあと、もう一度開いてください。</p>
        </section>
      ) : (
        <section className="phase5-deep-list" aria-label={`${section.label}一覧`}>
          {readState.kind === "stale" && <p className="phase5-deep-freshness" role="status">表示中の学習データは少し前のものです。</p>}
          {nodes.length > 0 ? nodes.map((node) => (
            <Link className="phase5-deep-row" href={`/projects/${workspace.id}/${section.slug}/${encodeURIComponent(node.id)}`} key={node.id}>
              <span className="phase5-deep-row-leading" aria-hidden="true">{section.label.slice(0, 1)}</span>
              <span className="phase5-deep-row-main">
                <strong>{node.label}</strong>
                <span>{learnerGraphMeta(node.meta) || "補足情報はありません"}</span>
              </span>
              <span className="phase5-deep-row-arrow" aria-hidden="true">→</span>
            </Link>
          )) : (
            <div className="phase5-deep-empty">
              <strong>表示できる項目がありません。</strong>
              <p>学習データが更新されたあと、もう一度確認できます。</p>
            </div>
          )}
        </section>
      )}

      <PrimaryNav active="learn" />
    </main>
  );
}
