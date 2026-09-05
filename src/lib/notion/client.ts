import { Client } from "@notionhq/client";

let notionClient: Client | null = null;

export function getNotionClient() {
  const token = process.env.NOTION_TOKEN || process.env.StudyGraph_NOTION_TOKEN;

  if (!token) {
    return null;
  }

  if (!notionClient) {
    notionClient = new Client({
      auth: token,
      notionVersion: "2026-03-11",
    });
  }

  return notionClient;
}
