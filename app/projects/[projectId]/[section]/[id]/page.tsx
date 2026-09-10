import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { isRenderableProjectReadState, loadProjectReadState, projectReadStateToGraph } from "@/src/lib/projects/read-runtime";
import {
  getWorkspaceProject,
  getWorkspaceSection,
  getWorkspaceSectionForKind,
  learnerGraphMeta,
} from "@/src/lib/projects/workspace";

export const dynamic = "force-dynamic";

function isHttpUrl(value: string | undefined | null) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

export default async function ProjectWorkspaceDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; section: string; id: string }>;
}) {
  const { projectId, section: sectionSlug, id } = await params;
  const workspace = getWorkspaceProject(projectId);
  const section = getWorkspaceSection(projectId, sectionSlug);
  if (!workspace || !section) notFound();

  const readState = await loadProjectReadState(workspace.id);
  if (!isRenderableProjectReadState(readState)) {
    return (
      <main className="phase5-shell phase5-deep-shell phase5-workspace-shell">
        <AppHeader context={`${workspace.shortLabel} · ${section.label}`} backHref={`/projects/${workspace.id}/${section.slug}`} backLabel={section.label} />
        <div className="phase5-context-nav" aria-label="現在地">
          <Link href="/projects">学ぶ</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/projects/${workspace.id}`}>{workspace.title}</Link>
          <span aria-hidden="true">›</span>
          <Link href={`/projects/${workspace.id}/${section.slug}`}>{section.label}</Link>
        </div>
        <section className="phase5-deep-unavailable" role="status" aria-live="polite">
          <h1 className="phase5-page-title">学習データを表示できません</h1>
          <p>この項目は現在利用できません。学習状況を確認できたあと、もう一度開いてください。</p>
          <Link href={`/projects/${workspace.id}/${section.slug}`}>一覧へ戻る</Link>
        </section>
        <PrimaryNav active="learn" />
      </main>
    );
  }

  const graph = projectReadStateToGraph(readState);

  const node = graph.nodes.find((candidate) => candidate.id === id && candidate.kind === section.kind);
  if (!node) notFound();

  const related = graph.edges.flatMap((edge) => {
    const relatedId = edge.source === node.id ? edge.target : edge.target === node.id ? edge.source : null;
    if (!relatedId) return [];
    const relatedNode = graph.nodes.find((candidate) => candidate.id === relatedId);
    const relatedSection = relatedNode ? getWorkspaceSectionForKind(workspace.id, relatedNode.kind) : null;
    return relatedNode && relatedSection ? [{ edge, node: relatedNode, section: relatedSection }] : [];
  });

  const graphFocusHref = `/graph?project=${encodeURIComponent(workspace.id)}&node=${encodeURIComponent(node.id)}&view=focus`;
  const meta = learnerGraphMeta(node.meta);

  return (
    <main className="phase5-shell phase5-deep-shell phase5-workspace-shell">
      <AppHeader context={`${workspace.shortLabel} · ${section.label}`} backHref={`/projects/${workspace.id}/${section.slug}`} backLabel={section.label} />

      <div className="phase5-context-nav" aria-label="現在地">
        <Link href="/projects">学ぶ</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/projects/${workspace.id}`}>{workspace.title}</Link>
        <span aria-hidden="true">›</span>
        <Link href={`/projects/${workspace.id}/${section.slug}`}>{section.label}</Link>
      </div>

      <header className="phase5-detail-heading">
        <div>
          <p className="phase5-eyebrow">{section.label}</p>
          <h1 className="phase5-page-title">{node.label}</h1>
        </div>
      </header>

      {readState.kind === "stale" && <p className="phase5-deep-freshness" role="status">表示中の学習データは少し前のものです。</p>}

      <section className="phase5-detail-section" aria-labelledby="workspace-detail-summary">
        <h2 id="workspace-detail-summary">概要</h2>
        <p className="phase5-detail-copy">{meta || "補足情報はありません。"}</p>
      </section>

      {related.length > 0 && (
        <section className="phase5-detail-section" aria-labelledby="workspace-related-title">
          <h2 id="workspace-related-title">つながっている知識</h2>
          <div className="phase5-related-list">
            {related.map(({ edge, node: relatedNode, section: relatedSection }) => (
              <Link className="phase5-related-row" href={`/projects/${workspace.id}/${relatedSection.slug}/${encodeURIComponent(relatedNode.id)}`} key={edge.id}>
                <span className="phase5-related-label">{edge.label}</span>
                <strong>{relatedNode.label}</strong>
                <span aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {isHttpUrl(node.notionUrl) && (
        <section className="phase5-detail-reference">
          <span>参照資料</span>
          <a href={node.notionUrl} target="_blank" rel="noreferrer">元の資料を開く <span aria-hidden="true">↗</span></a>
        </section>
      )}

      <nav className="phase5-detail-actions" aria-label="この項目の操作">
        <Link href={`/projects/${workspace.id}/${section.slug}`}>一覧へ戻る</Link>
        <Link href={graphFocusHref}>知識のつながりを見る</Link>
      </nav>

      <PrimaryNav active="learn" />
    </main>
  );
}
