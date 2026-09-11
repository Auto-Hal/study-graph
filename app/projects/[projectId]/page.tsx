import Link from "next/link";
import { notFound } from "next/navigation";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { loadProjectReadState } from "@/src/lib/projects/read-runtime";
import { getWorkspaceProject } from "@/src/lib/projects/workspace";

export const dynamic = "force-dynamic";

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const workspace = getWorkspaceProject(projectId);
  if (!workspace) notFound();

  const readState = await loadProjectReadState(workspace.id);
  const learningSections = workspace.sections.filter((section) => section.group === "learning");
  const knowledgeSections = workspace.sections.filter((section) => section.group === "knowledge");

  return (
    <main className="phase5-shell phase5-deep-shell phase5-workspace-shell">
      <AppHeader context={`${workspace.shortLabel} · 学ぶ`} backHref="/projects" backLabel="学ぶ" />

      <div className="phase5-context-nav" aria-label="現在地">
        <Link href="/projects">学ぶ</Link>
        <span aria-hidden="true">›</span>
        <span>{workspace.title}</span>
      </div>

      <section className="phase5-page-heading phase5-deep-heading phase5-workspace-overview">
        <div>
          <p className="phase5-eyebrow">{workspace.shortLabel}</p>
          <h1 className="phase5-page-title">{workspace.title}</h1>
          <p className="phase5-context">{workspace.context}</p>
        </div>
      </section>

      {(readState.kind === "stale") && (
        <p className="phase5-deep-freshness" role="status">表示中の学習データは少し前のものです。</p>
      )}
      {(readState.kind === "missing" || readState.kind === "unavailable" || readState.kind === "invalid-candidate" || readState.kind === "conflict") && (
        <p className="phase5-deep-freshness" role="status">学習状況は現在表示できません。学習コンテンツは開けます。</p>
      )}

      <section className="phase5-workspace-section" aria-labelledby="workspace-learning-title">
        <div className="phase5-section-heading">
          <h2 id="workspace-learning-title">学習</h2>
        </div>
        <div className="phase5-workspace-links">
          {learningSections.map((section) => (
            <Link className="phase5-workspace-entry" href={`/projects/${workspace.id}/${section.slug}`} key={section.slug}>
              <span className="phase5-workspace-entry-main"><strong>{section.label}</strong><span>講義を開く</span></span>
              <span className="phase5-workspace-entry-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="phase5-workspace-section" aria-labelledby="workspace-knowledge-title">
        <div className="phase5-section-heading">
          <h2 id="workspace-knowledge-title">知識</h2>
        </div>
        <div className="phase5-workspace-links">
          {knowledgeSections.map((section) => (
            <Link className="phase5-workspace-entry" href={`/projects/${workspace.id}/${section.slug}`} key={section.slug}>
              <span className="phase5-workspace-entry-main"><strong>{section.label}</strong><span>一覧を見る</span></span>
              <span className="phase5-workspace-entry-arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>

      <details className="phase5-workspace-section phase5-workspace-graph">
        <summary className="phase5-workspace-graph-summary">
          <span className="phase5-workspace-graph-summary-main">
            <strong>知識のつながり</strong>
            <small>関係を見ながら学ぶ</small>
          </span>
          <span className="phase5-workspace-graph-toggle" aria-hidden="true">＋</span>
        </summary>
        <div className="phase5-workspace-graph-content">
          <p>{workspace.graphContext}</p>
          <Link className="phase5-workspace-graph-link" href={workspace.graphHref}>
            <span>つながりを見る</span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </details>

      <PrimaryNav active="learn" />
    </main>
  );
}
