const SOURCE = "https://codh.rois.ac.jp/iiif/iiif-curation-viewer/image/200015843_00012_2/601,849,77,97/full/0/default.jpg";

export async function GET() {
  const response = await fetch(SOURCE, {
    headers: {
      "User-Agent": "StudyGraph/1.0 (+https://study-graph-five.vercel.app)",
      Accept: "image/jpeg,image/*;q=0.8,*/*;q=0.5",
    },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });

  if (!response.ok) {
    return new Response("Image unavailable", { status: 502 });
  }

  const body = await response.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": response.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
    },
  });
}
