import { parseCsv } from "./contracts";
import type { UsageRow } from "./types";

/**
 * BigQuery에서 내보낸 사용량 CSV를 UsageRow[]로 파싱한다.
 * 조직 정책상 서버에서 BigQuery 직접 조회(OAuth)가 재인증으로 끊기므로,
 * 사용자가 콘솔에서 쿼리 결과를 CSV로 내보내 업로드하는 경로를 지원한다.
 *
 * 두 가지 형태를 모두 받는다:
 *  (A) 집계 결과: publisher, usedIsbn(또는 isbn), bookName, userCount, unitPrice, status
 *  (B) 원시 로그: userHash, isbn, bookTitle, publisher (→ publisher+isbn별 COUNT(DISTINCT userHash))
 * 헤더 이름은 한/영 별칭을 허용한다.
 */

const ALIASES: Record<keyof ColMap, string[]> = {
  publisher: ["publisher", "출판사"],
  isbn: ["usedisbn", "isbn", "사용isbn", "사용 isbn", "도서isbn", "교재isbn"],
  bookName: ["bookname", "booktitle", "book_title", "교재명", "도서명", "제목", "title", "교재"],
  userCount: ["usercount", "user_count", "사용자수", "사용자 수", "등록수", "등록교재수", "등록 교재 수", "count", "countunique", "고유사용자수"],
  unitPrice: ["unitprice", "단가", "consumer_price", "consumerprice", "정가", "교재정가", "bookprice"],
  status: ["status", "승인여부", "미허가여부", "계약여부"],
  userHash: ["userhash", "user_hash", "사용자해시"],
};

interface ColMap {
  publisher: number;
  isbn: number;
  bookName: number;
  userCount: number;
  unitPrice: number;
  status: number;
  userHash: number;
}

function normKey(s: string): string {
  return String(s || "").trim().toLowerCase().replace(/[\s_]/g, "");
}

function buildColMap(header: string[]): ColMap {
  const idx: ColMap = { publisher: -1, isbn: -1, bookName: -1, userCount: -1, unitPrice: -1, status: -1, userHash: -1 };
  const normHeader = header.map(normKey);
  (Object.keys(ALIASES) as (keyof ColMap)[]).forEach((key) => {
    for (const alias of ALIASES[key]) {
      const a = normKey(alias);
      const pos = normHeader.indexOf(a);
      if (pos >= 0) {
        idx[key] = pos;
        break;
      }
    }
  });
  return idx;
}

/** 출판사 정규화 (원시 로그 업로드 시 books.publisher 원문을 그룹키로 통일) */
function normalizePublisher(raw: string): string | null {
  const s = String(raw || "");
  if (/NE능률|능률/.test(s)) return "NE능률";
  if (/개념원리/.test(s)) return "개념원리";
  if (/쎄듀/.test(s)) return "쎄듀";
  if (/지학사/.test(s)) return "지학사";
  if (/키출판사/.test(s)) return "키출판사";
  if (/마더텅/.test(s)) return "마더텅";
  // 수경출판사는 현재 정산 제외
  return s.trim() || null;
}

function toNum(v: string): number {
  const n = Number(String(v || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function parseUsageCsv(text: string): UsageRow[] {
  const rows = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (rows.length < 2) return [];
  const col = buildColMap(rows[0]);
  const body = rows.slice(1);

  if (col.isbn < 0) {
    throw new Error("CSV에 ISBN 컬럼을 찾지 못했습니다. (헤더에 isbn / usedIsbn / 사용ISBN 중 하나 필요)");
  }

  // (A) 집계 결과: userCount 컬럼이 있으면 행을 그대로 사용
  if (col.userCount >= 0) {
    const out: UsageRow[] = [];
    for (const r of body) {
      const isbn = String(r[col.isbn] ?? "").trim();
      if (!/^\d{10,13}$/.test(isbn)) continue;
      const publisher = col.publisher >= 0 ? normalizePublisher(r[col.publisher]) : null;
      out.push({
        publisher,
        usedIsbn: isbn,
        bookName: col.bookName >= 0 ? String(r[col.bookName] ?? "").trim() || null : null,
        userCount: toNum(r[col.userCount]),
        unitPrice: col.unitPrice >= 0 ? toNum(r[col.unitPrice]) : null,
        status: col.status >= 0 ? String(r[col.status] ?? "").trim() || null : null,
      });
    }
    return out;
  }

  // (B) 원시 로그: userHash가 있으면 publisher+isbn별 COUNT(DISTINCT userHash)
  if (col.userHash >= 0) {
    const groups = new Map<string, { publisher: string | null; isbn: string; bookName: string | null; users: Set<string>; unitPrice: number | null; status: string | null }>();
    for (const r of body) {
      const isbn = String(r[col.isbn] ?? "").trim();
      if (!/^\d{10,13}$/.test(isbn)) continue;
      const publisher = col.publisher >= 0 ? normalizePublisher(r[col.publisher]) : null;
      const key = `${publisher ?? ""}__${isbn}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          publisher,
          isbn,
          bookName: col.bookName >= 0 ? String(r[col.bookName] ?? "").trim() || null : null,
          users: new Set(),
          unitPrice: col.unitPrice >= 0 ? toNum(r[col.unitPrice]) : null,
          status: col.status >= 0 ? String(r[col.status] ?? "").trim() || null : null,
        };
        groups.set(key, g);
      }
      g.users.add(String(r[col.userHash] ?? ""));
    }
    return Array.from(groups.values()).map((g) => ({
      publisher: g.publisher,
      usedIsbn: g.isbn,
      bookName: g.bookName,
      userCount: g.users.size,
      unitPrice: g.unitPrice,
      status: g.status,
    }));
  }

  throw new Error("CSV에 사용자수(userCount) 또는 userHash 컬럼이 필요합니다.");
}
