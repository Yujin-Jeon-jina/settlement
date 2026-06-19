import { NextResponse } from "next/server";
import https from "https";

export const dynamic = "force-dynamic";

// 임시 네트워크 진단: 컨테이너에서 Google 엔드포인트에 닿는지
// (A) Node 내장 https 모듈, (B) 전역 fetch(undici) 두 방식으로 각각 테스트.
function nodeHttps(url: string): Promise<string> {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let len = 0;
      res.on("data", (c) => (len += c.length));
      res.on("end", () => resolve(`OK status=${res.statusCode} bytes=${len}`));
    });
    req.on("error", (e) => resolve(`ERR ${e.message}`));
    req.on("timeout", () => {
      req.destroy();
      resolve("ERR timeout(15s)");
    });
  });
}

async function viaFetch(url: string): Promise<string> {
  try {
    const r = await fetch(url, { method: "GET" });
    const t = await r.text();
    return `OK status=${r.status} bytes=${t.length}`;
  } catch (e) {
    return `ERR ${(e as Error).message}`;
  }
}

export async function GET() {
  const targets = [
    "https://oauth2.googleapis.com/token",
    "https://www.googleapis.com/discovery/v1/apis",
    "https://bigquery.googleapis.com/discovery/v1/apis",
  ];
  const result: Record<string, { nodeHttps: string; fetch: string }> = {};
  for (const url of targets) {
    result[url] = { nodeHttps: await nodeHttps(url), fetch: await viaFetch(url) };
  }
  return NextResponse.json({ node: process.version, result });
}
