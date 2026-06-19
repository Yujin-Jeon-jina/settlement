import { prisma } from "./db";
import { useMock } from "./gcp";
import { MOCK_CONTRACTS } from "./mock";
import type { ContractBook } from "./types";

/**
 * 계약 교재 마스터 = 업로드된 IP LIST CSV (Postgres Contract 테이블).
 * 회사 정책상 Sheets API 직접 읽기가 막혀 CSV 업로드 방식 사용.
 */
export async function getContracts(): Promise<ContractBook[]> {
  try {
    const rows = await prisma.contract.findMany();
    if (rows.length > 0) {
      return rows.map((r) => ({
        isbn: r.isbn,
        publisher: r.publisher,
        title: r.title,
        bookPrice: r.bookPrice,
        startDate: r.startDate,
        endDate: r.endDate,
      }));
    }
  } catch {
    /* DB 미연결 등 */
  }
  return useMock() ? MOCK_CONTRACTS : [];
}

export async function countContracts(): Promise<number> {
  try {
    return await prisma.contract.count();
  } catch {
    return 0;
  }
}

/** 단일 계약 교재 수동 추가/수정 (수동 입력 매칭용) */
export async function upsertContract(c: {
  isbn: string;
  publisher: string;
  title: string;
  bookPrice: number;
}): Promise<void> {
  await prisma.contract.upsert({
    where: { isbn: c.isbn },
    create: { isbn: c.isbn, publisher: c.publisher, title: c.title, bookPrice: c.bookPrice },
    update: { publisher: c.publisher, title: c.title, bookPrice: c.bookPrice },
  });
}

/** RFC4180 유사 CSV 파서 (따옴표·내부 콤마 처리) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQ = false;
      } else field += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        row.push(field);
        field = "";
      } else if (ch === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else if (ch === "\r") {
        /* skip */
      } else field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function toNumber(v: string): number {
  const n = Number(String(v || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * IP LIST CSV 텍스트를 파싱해 Contract 테이블 전체 교체.
 * 컬럼: ISBN, publisher, title, bookPrice, startDate, endDate
 */
export async function importContractsFromCsv(text: string): Promise<{ count: number }> {
  const rows = parseCsv(text);
  const seen = new Set<string>();
  const books = rows
    .map((r) => ({
      isbn: String(r[0] ?? "").trim(),
      publisher: String(r[1] ?? "").trim(),
      title: String(r[2] ?? "").trim(),
      bookPrice: toNumber(String(r[3] ?? "")),
      startDate: (String(r[4] ?? "").trim() || null) as string | null,
      endDate: (String(r[5] ?? "").trim() || null) as string | null,
    }))
    .filter((b) => /^\d{10,13}$/.test(b.isbn))
    .filter((b) => (seen.has(b.isbn) ? false : (seen.add(b.isbn), true)));

  await prisma.$transaction([
    prisma.contract.deleteMany({}),
    prisma.contract.createMany({ data: books }),
  ]);
  return { count: books.length };
}
