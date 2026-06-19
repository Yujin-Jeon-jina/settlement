import { NextResponse } from "next/server";
import https from "https";

export const dynamic = "force-dynamic";

// 임시 진단: 실제 refresh_token으로 액세스 토큰 갱신을 (A) node https POST,
// (B) fetch POST 두 방식으로 시도. 액세스 토큰 값은 노출하지 않고 성공/실패만 표시.
function creds() {
  const raw = process.env.GOOGLE_OAUTH_CREDENTIALS || "";
  try {
    return JSON.parse(raw) as { client_id: string; client_secret: string; refresh_token: string };
  } catch {
    return null;
  }
}

function body(c: { client_id: string; client_secret: string; refresh_token: string }) {
  return new URLSearchParams({
    client_id: c.client_id,
    client_secret: c.client_secret,
    refresh_token: c.refresh_token,
    grant_type: "refresh_token",
  }).toString();
}

function redact(s: string) {
  return s.replace(/"access_token"\s*:\s*"[^"]+"/g, '"access_token":"<redacted>"').slice(0, 400);
}

function nodePost(payload: string): Promise<string> {
  return new Promise((resolve) => {
    const req = https.request(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
        },
        timeout: 20000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(`status=${res.statusCode} body=${redact(d)}`));
      }
    );
    req.on("error", (e) => resolve(`ERR ${e.message}`));
    req.on("timeout", () => {
      req.destroy();
      resolve("ERR timeout(20s)");
    });
    req.write(payload);
    req.end();
  });
}

async function fetchPost(payload: string): Promise<string> {
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload,
    });
    const t = await r.text();
    return `status=${r.status} body=${redact(t)}`;
  } catch (e) {
    return `ERR ${(e as Error).message}`;
  }
}

export async function GET() {
  const c = creds();
  if (!c) return NextResponse.json({ error: "GOOGLE_OAUTH_CREDENTIALS 파싱 실패/미설정" });
  const payload = body(c);
  return NextResponse.json({
    node: process.version,
    refreshTokenLen: c.refresh_token?.length ?? 0,
    nodeHttpsPost: await nodePost(payload),
    fetchPost: await fetchPost(payload),
  });
}
