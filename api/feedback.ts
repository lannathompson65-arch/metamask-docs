import type { VercelRequest, VercelResponse } from "@vercel/node";
import { sheets } from "@googleapis/sheets";
import { GoogleAuth } from "google-auth-library";

interface FeedbackBody {
  page_url: string;
  rating: "yes" | "no";
  reason?: string;
  timestamp?: string;
}

function stripHtml(text: string): string {
  let prev = text;
  while (true) {
    const next = prev.replace(/<[^>]*>/g, "");
    if (next === prev) return next;
    prev = next;
  }
}

function sanitize(text: string): string {
  return stripHtml(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/@/g, "@\u200B")
    .replace(/#(\d)/g, "#\u200B$1")
    .slice(0, 1000)
    .trim();
}

function isValidPageUrl(url: string): boolean {
  if (url.startsWith("/")) return /^\/[\w\-./]*$/.test(url);
  try {
    const parsed = new URL(url);
    return parsed.origin === "https://docs.metamask.io";
  } catch {
    return false;
  }
}

function getDeviceType(ua: string): "mobile" | "desktop" {
  return /Mobile|Android|iPhone|iPad/i.test(ua) ? "mobile" : "desktop";
}

const credentials = JSON.parse(
  Buffer.from(process.env.GOOGLE_SHEETS_CREDENTIALS!, "base64").toString(),
);

const auth = new GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheetsClient = sheets({ version: "v4", auth });

async function appendToSheet(row: string[]) {
  await sheetsClient.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID!,
    range: "Sheet1!A:E",
    valueInputOption: "RAW",
    requestBody: { values: [row] },
  });
}

async function createGitHubIssue(
  pageUrl: string,
  reason: string,
): Promise<string | null> {
  const repo = process.env.GITHUB_REPO!;
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `Docs feedback: ${pageUrl}`,
      body: `**Page:** ${pageUrl}\n\n**Feedback:**\n${reason}`,
      labels: ["user-feedback"],
    }),
  });

  if (!res.ok) {
    console.error(
      "GitHub issue creation failed:",
      res.status,
      await res.text(),
    );
    return null;
  }

  const data = await res.json();
  return data.html_url;
}

async function notifySlack(
  pageUrl: string,
  reason: string,
  issueUrl: string | null,
) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  let text = `:warning: Negative docs feedback on *${pageUrl}*\n>${reason.replace(/\n/g, "\n>")}`;
  if (issueUrl) {
    text += `\n<${issueUrl}|View GitHub issue>`;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    console.error("Slack notification failed:", res.status, await res.text());
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    page_url: pageUrl,
    rating,
    reason,
    timestamp,
  } = req.body as FeedbackBody;

  if (!pageUrl || !rating || !["yes", "no"].includes(rating)) {
    return res
      .status(400)
      .json({ error: "page_url and rating (yes/no) are required" });
  }

  if (!isValidPageUrl(pageUrl)) {
    return res.status(400).json({ error: "invalid page_url" });
  }

  const cleanReason = reason ? sanitize(reason) : "";

  if (rating === "no" && !cleanReason) {
    return res
      .status(400)
      .json({ error: "reason is required for negative feedback" });
  }

  const ts = timestamp ?? new Date().toISOString();

  try {
    await appendToSheet([
      ts,
      pageUrl,
      rating,
      cleanReason,
      getDeviceType((req.headers["user-agent"] as string) ?? ""),
    ]);
  } catch (err) {
    console.error("Google Sheets append failed:", err);
  }

  if (rating === "no" && cleanReason) {
    let issueUrl: string | null = null;
    try {
      issueUrl = await createGitHubIssue(pageUrl, cleanReason);
    } catch (err) {
      console.error("GitHub issue failed:", err);
    }

    try {
      await notifySlack(pageUrl, cleanReason, issueUrl);
    } catch (err) {
      console.error("Slack notification failed:", err);
    }
  }

  return res.status(200).json({ ok: true });
}
