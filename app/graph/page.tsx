import Link from "next/link";
import AppHeader from "@/src/components/AppHeader";
import PrimaryNav from "@/src/components/PrimaryNav";
import { getGraphLearningOverlay } from "@/src/lib/graph/learning";
import { getGraphProject, listGraphProjects, loadProjectGraph } from "@/src/lib/graph/registry";
import GraphExplorer from "./GraphExplorer";

export const dynamic = "force-dynamic";

export default async function KnowledgeGraphPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; node?: string; relation?: string; view?: string }>;
}) {
  const query = await searchParams;
  const project = getGraphProject(query.project);
  const [graph, graphProjects] = await Promise.all([
    loadProjectGraph(project.id),
    Promise.resolve(listGraphProjects()),
  ]);
  const graphIsTrusted = graph.mode === "notion";
  const learning = graphIsTrusted ? await getGraphLearningOverlay(graph.nodes, graph.edges) : null;
  const initialNodeId = query.node && graph.nodes.some((node) => node.id === query.node) ? query.node : undefined;
  const initialRelation = query.relation && graph.edges.some((edge) => edge.label === query.relation) ? query.relation : undefined;
  const initialView = query.view === "focus" ? "focus" as const : "overview" as const;
  const graphContext = project.id === "kuzushiji"
    ? "講義・文字・資料の関係を見る"
    : project.id === "philosophy"
      ? "思想・人物・著作の関係を見る"
      : "作品・人物・時代の関係を見る";

  return (
    <main className="phase5-shell phase5-graph-shell">
      <AppHeader context={`${project.shortLabel} · 学ぶ`} backHref="/projects" backLabel="学ぶ" />

      <section className="phase5-page-heading phase5-deep-heading">
        <div>
          <p className="phase5-eyebrow">{project.shortLabel}</p>
          <h1 className="phase5-page-title">知識のつながり</h1>
          <p className="phase5-context">{graphContext}</p>
        </div>
      </section>

      <nav className="phase5-deep-selector" aria-label="プロジェクトを選ぶ">
        {graphProjects.map((item) => item.graphAvailable ? (
          <Link
            className={item.id === project.id ? "active" : undefined}
            href={`/graph?project=${encodeURIComponent(item.id)}`}
            key={item.id}
            aria-current={item.id === project.id ? "page" : undefined}
          >
            {item.shortLabel}
          </Link>
        ) : (
          <span className="planned" key={item.id} aria-disabled="true">{item.shortLabel}<small>準備中</small></span>
        ))}
      </nav>

      {graphIsTrusted ? (
        <>
          <p className="phase5-deep-meta" aria-label="表示中の知識量">
            {graph.nodes.length}項目 · {graph.edges.length}のつながり
          </p>

          <section className="phase5-deep-learning" aria-label="学習状態">
            <div>
              <span className="phase5-deep-label">復習の手がかり</span>
              <p>{learning?.mode === "supabase" ? "知識の地図に、これまでの復習状態を重ねています。" : "復習状態は現在表示できません。"}</p>
            </div>
            <dl>
              <div><dt>学習済み</dt><dd>{learning?.summary.tracked ?? 0}</dd></div>
              <div><dt>復習時期</dt><dd>{learning?.summary.due ?? 0}</dd></div>
              <div><dt>要確認</dt><dd>{learning?.summary.weak ?? 0}</dd></div>
              <div><dt>最近復習</dt><dd>{learning?.summary.recent ?? 0}</dd></div>
            </dl>
          </section>

          <GraphExplorer
            projectId={project.id}
            kindDefinitions={project.graphNodeKinds}
            nodes={graph.nodes}
            edges={graph.edges}
            learning={learning!}
            initialNodeId={initialNodeId}
            initialRelation={initialRelation}
            initialView={initialView}
          />
        </>
      ) : (
        <section className="phase5-deep-unavailable" role="status" aria-live="polite">
          <p className="phase5-eyebrow">{project.shortLabel}</p>
          <h2>知識のつながりを表示できません</h2>
          <p>学習データを確認できないため、つながりの地図は表示していません。</p>
          <Link href="/settings/advanced/diagnostics">接続を確認する</Link>
        </section>
      )}

      <PrimaryNav active="learn" />
    </main>
  );
}
