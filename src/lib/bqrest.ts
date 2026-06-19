import https from "https";
import fs from "fs";

/**
 * @google-cloud/bigquery 내부의 node-fetch가 컨테이너 환경에서 토큰/쿼리 POST 시
 * "Premature close"로 실패하는 문제를 우회하기 위해, Node 내장 https로 직접
 * BigQuery REST를 호출한다. (node https는 동일 환경에서 정상 동작 검증됨)
 */

interface AuthorizedUser {
  client_id: string;
  client_secret: string;
  refresh_token: string;
}

function readAuthorizedUser(): AuthorizedUser | null {
  let raw = process.env.GOOGLE_OAUTH_CREDENTIALS || "";
  if (!raw && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      raw = fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, "utf8");
    } catch {
      /* noop */
    }
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (j.type === "authorized_user" && j.refresh_token) {
      return { client_id: j.client_id, client_secret: j.client_secret, refresh_token: j.refresh_token };
    }
  } catch {
    /* noop */
  }
  return null;
}

/** REST 경로 사용 가능 여부 (authorized_user 자격증명 보유) */
export function canUseRest(): boolean {
  return !!readAuthorizedUser();
}

function httpsJson(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: string
): Promise<{ status: number; json: any; raw: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers, timeout: 90_000 }, (res) => {
      let d = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        let json: any = null;
        try {
          json = d ? JSON.parse(d) : null;
        } catch {
          json = null;
        }
        resolve({ status: res.statusCode || 0, json, raw: d });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request timeout")));
    if (body) req.write(body);
    req.end();
  });
}

let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const c = readAuthorizedUser();
  if (!c) throw new Error("authorized_user 자격증명 없음");
  const payload = new URLSearchParams({
    client_id: c.client_id,
    client_secret: c.client_secret,
    refresh_token: c.refresh_token,
    grant_type: "refresh_token",
  }).toString();
  const { status, json, raw } = await httpsJson(
    "https://oauth2.googleapis.com/token",
    "POST",
    {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(payload)),
    },
    payload
  );
  if (status !== 200 || !json?.access_token) {
    throw new Error(`토큰 갱신 실패 status=${status} ${raw.slice(0, 200)}`);
  }
  tokenCache = { token: json.access_token, exp: Date.now() + Number(json.expires_in || 3600) * 1000 };
  return tokenCache.token;
}

export interface QueryParam {
  name: string;
  type: string; // "DATE" | "STRING" | ...
  value: string;
}

/** BigQuery jobs.query 를 node https로 직접 호출. 행을 {필드명: 값(string|null)} 배열로 반환. */
export async function runQuery(
  projectId: string,
  sql: string,
  params?: QueryParam[]
): Promise<Record<string, string | null>[]> {
  const token = await getAccessToken();
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}`;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const reqBody: any = { query: sql, useLegacySql: false, timeoutMs: 60_000, maxResults: 50_000 };
  if (params && params.length) {
    reqBody.parameterMode = "NAMED";
    reqBody.queryParameters = params.map((p) => ({
      name: p.name,
      parameterType: { type: p.type },
      parameterValue: { value: p.value },
    }));
  }
  const bodyStr = JSON.stringify(reqBody);

  let resp = await httpsJson(
    `${base}/queries`,
    "POST",
    { ...auth, "Content-Length": String(Buffer.byteLength(bodyStr)) },
    bodyStr
  );
  if (resp.status !== 200) {
    const msg = resp.json?.error?.message || resp.raw.slice(0, 400);
    throw new Error(`BigQuery 쿼리 실패 status=${resp.status} ${msg}`);
  }

  let data = resp.json;
  const fields: { name: string }[] = data.schema?.fields ? [...data.schema.fields] : [];
  const jobId = data.jobReference?.jobId;
  const location = data.jobReference?.location || "";
  const rows: Record<string, string | null>[] = [];

  const collect = (rs: any[]) => {
    for (const r of rs || []) {
      const o: Record<string, string | null> = {};
      (r.f || []).forEach((cell: any, i: number) => {
        const name = fields[i]?.name;
        if (name) o[name] = cell.v ?? null;
      });
      rows.push(o);
    }
  };

  // 잡이 아직 안 끝났으면 완료까지 폴링
  let guard = 0;
  while (!data.jobComplete && guard++ < 30) {
    const url = `${base}/queries/${jobId}?location=${encodeURIComponent(location)}&timeoutMs=60000`;
    resp = await httpsJson(url, "GET", auth);
    if (resp.status !== 200) {
      const msg = resp.json?.error?.message || resp.raw.slice(0, 300);
      throw new Error(`getQueryResults 실패 status=${resp.status} ${msg}`);
    }
    data = resp.json;
    if (!fields.length && data.schema?.fields) fields.push(...data.schema.fields);
  }

  collect(data.rows);

  // 페이지네이션
  let pageToken = data.pageToken;
  while (pageToken) {
    const url = `${base}/queries/${jobId}?location=${encodeURIComponent(location)}&pageToken=${encodeURIComponent(
      pageToken
    )}`;
    resp = await httpsJson(url, "GET", auth);
    if (resp.status !== 200) break;
    data = resp.json;
    collect(data.rows);
    pageToken = data.pageToken;
  }

  return rows;
}

/** Google Sheets 값 읽기 (node https). 토큰에 spreadsheets 스코프 필요. */
export async function sheetGet(spreadsheetId: string, range: string): Promise<string[][]> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
    range
  )}?majorDimension=ROWS`;
  const { status, json, raw } = await httpsJson(url, "GET", { Authorization: `Bearer ${token}` });
  if (status !== 200) {
    const msg = json?.error?.message || raw.slice(0, 200);
    throw new Error(`Sheets 읽기 실패 status=${status} ${msg}`);
  }
  return (json?.values as string[][]) || [];
}

/** gid(sheetId)로 탭 제목 조회 */
export async function sheetTitleByGid(spreadsheetId: string, gid: number): Promise<string | null> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
  const { status, json } = await httpsJson(url, "GET", { Authorization: `Bearer ${token}` });
  if (status !== 200) return null;
  const s = (json?.sheets || []).find((x: any) => x?.properties?.sheetId === gid);
  return s?.properties?.title || null;
}
