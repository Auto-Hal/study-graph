import Link from "next/link";
import PrimaryNav from "@/src/components/PrimaryNav";
import { studyProjects } from "@/src/lib/projects/registry";
import { getKuzushijiDashboard } from "@/src/lib/notion/kuzushiji";
import { getDueReviewItems } from "@/src/lib/supabase/review";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const data = await getKuzushijiDashboard();
  const scheduledReview = await getDueReviewItems(data.reviewQueue);
  const completedLectures = data.lectures.filter((lecture) => lecture.status === "完了").length;

  return (
    <main className="learn-shell">
      <header className="learn-header">
        <Link className="learn-brand" href="/"><span className="learn-brand-mark" aria-hidden="true">SG</span><span><strong>Study Graph</strong><small>学習プロジェクト</small></span></Link>
        <div className={`sync-pill ${data.mode === "notion" ? "online" : "demo"}`}><span className="dot" />{data.mode === "notion" ? "Notion 接続中" : "Demo data"}</div>
      </header>

      <section className="learn-hero">
        <p className="eyebrow">PROJECT REGISTRY · PHASE 2.3</p>
        <h1>学習を、プロジェクト単位で辿る。</h1>
        <p className="learn-hero-copy">NotionのDB構造は分野ごとに保ったまま、Study Graph側のAdapterで共通Graphへ接続します。くずし字に加えて、西洋美術史Knowledge Graph Pilotが利用可能になりました。</p>
      </section>

      <section className="project-list" aria-label="学習プロジェクト一覧">
        {studyProjects.map((project) => project.status === "active" ? (
          <Link className="project-entry" href={project.href} key={project.id}>
            <span className="project-entry-icon" aria-hidden="true">{project.icon}</span>
            <div><p className="eyebrow">ACTIVE PROJECT · {project.phase}</p><h2>{project.title}</h2><p>{project.goal}</p></div>
            <div className="project-entry-meta">
              {project.id === "kuzushiji" ? (
                <><span className="mini-pill">講義 {data.lectures.length}</span><span className="mini-pill">完了 {completedLectures}</span><span className="mini-pill">今日 {scheduledReview.items.length}問</span></>
              ) : (
                <><span className="mini-pill">Knowledge Graph Pilot</span><span className="mini-pill">{project.graphNodeKinds.length} node types</span><span className="mini-pill">Notion read-only</span></>
              )}
            </div>
          </Link>
        ) : (
          <article className="project-entry project-entry-planned" key={project.id} aria-label={`${project.title} ${project.phase}予定`}>
            <span className="project-entry-icon" aria-hidden="true">{project.icon}</span>
            <div><p className="eyebrow">REGISTERED · {project.phase}</p><h2>{project.title}</h2><p>{project.goal}</p></div>
            <div className="project-entry-meta"><span className="mini-pill">Adapter準備中</span><span className="mini-pill">{project.graphNodeKinds.length} node types</span></div>
          </article>
        ))}
      </section>

      <PrimaryNav active="learn" />
    </main>
  );
}
