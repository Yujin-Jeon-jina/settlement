import type { ContractBook } from "./types";
import { MOCK_CONTRACTS } from "./mock";
import { useMock } from "./gcp";
import { sheetGet, sheetTitleByGid } from "./bqrest";

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const CONTRACT_SHEET_ID = () =>
  process.env.CONTRACT_SHEET_ID || "1xrC3seWM8FH-MnpvE06shsbKKZOcAoIprIpboOiKQos";

/** IP LIST 시트의 정산 기준 탭 이름 (gid 또는 탭명) 해석 */
async function contractTab(sheetId: string): Promise<string> {
  if (process.env.CONTRACT_SHEET_TAB) return process.env.CONTRACT_SHEET_TAB;
  const gid = process.env.CONTRACT_SHEET_GID || "682428382";
  const title = await sheetTitleByGid(sheetId, Number(gid));
  return title || "2026";
}

/**
 * 계약 교재 마스터 = IP LIST 시트(MATHPRESSO CONTRACTED IP LIST).
 * 책당 ISBN 1개 + 단가(bookPrice). 정산 기준이 되는 계약 목록.
 * 컬럼: ISBN, publisher, title, bookPrice, startDate, endDate
 */
export async function fetchContracts(): Promise<ContractBook[]> {
  if (useMock()) return MOCK_CONTRACTS;

  const sheetId = CONTRACT_SHEET_ID();
  const tab = await contractTab(sheetId);
  const rows = await sheetGet(sheetId, `${tab}!A:F`);

  const out: ContractBook[] = [];
  for (const r of rows) {
    const isbn = String(r[0] ?? "").trim();
    if (!/^\d{10,13}$/.test(isbn)) continue; // 헤더/설명행 스킵
    out.push({
      isbn,
      publisher: String(r[1] ?? "").trim(),
      title: String(r[2] ?? "").trim(),
      bookPrice: toNumber(r[3]),
      startDate: r[4] ? String(r[4]).trim() : null,
      endDate: r[5] ? String(r[5]).trim() : null,
    });
  }
  return out;
}

export interface PivotCount {
  publisher: string;
  usedIsbn: string;
  bookName: string;
  userCount: number;
}

/** bookips 시트 'Pivot' 탭을 읽어 (publisher, isbn, count) 추출 — 검증 대조용 */
export async function fetchPivotCounts(): Promise<PivotCount[]> {
  if (useMock()) {
    const { MOCK_USAGE } = await import("./mock");
    return MOCK_USAGE.map((u) => ({
      publisher: u.publisher ?? "",
      usedIsbn: u.usedIsbn,
      bookName: u.bookName ?? "",
      userCount: u.userCount,
    }));
  }
  const sheetId = process.env.BOOKIPS_SHEET_ID || "1xtT0DcS8A3lGCSZPcpvggo4pzZhmF2w1QWeIEo_BNVU";
  const tab = process.env.BOOKIPS_PIVOT_TAB || "Pivot";
  const rows = await sheetGet(sheetId, `${tab}!A:G`);
  const out: PivotCount[] = [];
  for (const r of rows) {
    const publisher = String(r[0] ?? "").trim();
    const isbn = String(r[1] ?? "").trim();
    if (!/^\d{10,13}$/.test(isbn)) continue;
    out.push({ publisher, usedIsbn: isbn, bookName: String(r[2] ?? "").trim(), userCount: toNumber(r[3]) });
  }
  return out;
}

/**
 * 쏠북 Summary / 출판사 폴더 시트에 정산 결과 write-back (선택 기능).
 * 시트 셀 좌표 매핑 확정 후 구현 예정.
 */
export async function appendToSummary(): Promise<void> {
  if (useMock()) {
    throw new Error("목업 모드: 시트 자동 기록은 실데이터 연동 후 사용 가능합니다.");
  }
  throw new Error("시트 write-back 좌표 매핑 미구현 (시트 구조 확정 필요)");
}
