import https from "https";

export interface BookInfo {
  title: string;
  author?: string;
  publisher?: string;
  pubDate?: string;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20000 }, (res) => {
      let d = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(d));
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("aladin timeout")));
  });
}

/**
 * 알라딘 OpenAPI ItemLookUp 으로 ISBN → 도서 정보 조회.
 * 환경변수 ALADIN_TTB_KEY 필요 (https://www.aladin.co.kr/ttb/wblog_manage.aspx 에서 무료 발급).
 */
export async function aladinLookup(isbn: string): Promise<BookInfo | null> {
  const key = process.env.ALADIN_TTB_KEY;
  if (!key) throw new Error("ALADIN_TTB_KEY 미설정");
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  const idType = clean.length === 13 ? "ISBN13" : "ISBN";
  const url =
    `https://www.aladin.co.kr/ttb/api/ItemLookUp.aspx?ttbkey=${encodeURIComponent(key)}` +
    `&itemIdType=${idType}&ItemId=${encodeURIComponent(clean)}&output=js&Version=20131101`;

  const raw = await httpsGet(url);
  // output=js 는 JSON을 반환하지만 앞뒤 잡음이 있을 수 있어 방어적으로 파싱
  let json: any;
  try {
    const s = raw.indexOf("{");
    const e = raw.lastIndexOf("}");
    json = JSON.parse(s >= 0 ? raw.slice(s, e + 1) : raw);
  } catch {
    return null;
  }
  if (json?.errorCode) throw new Error(`알라딘 오류: ${json.errorMessage || json.errorCode}`);
  const it = json?.item?.[0];
  if (!it) return null;
  return { title: it.title, author: it.author, publisher: it.publisher, pubDate: it.pubDate };
}
