import { google } from "googleapis";
import type { ContractBook } from "./types";
import { MOCK_CONTRACTS } from "./mock";

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
];

function useMock(): boolean {
  return process.env.USE_MOCK_DATA === "true" || !process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 미설정");
  return JSON.parse(raw) as { client_email: string; private_key: string };
}

export function googleAuth() {
  const sa = serviceAccount();
  return new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key.replace(/\\n/g, "\n"),
    scopes: SCOPES,
  });
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 계약 목록 시트를 읽어 ContractBook[] 반환 */
export async function fetchContracts(): Promise<ContractBook[]> {
  if (useMock()) return MOCK_CONTRACTS;

  const sheetId = process.env.CONTRACT_SHEET_ID!;
  const tab = process.env.CONTRACT_SHEET_TAB || "2026";
  const sheets = google.sheets({ version: "v4", auth: googleAuth() });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${tab}!A:F`,
  });
  const rows = res.data.values ?? [];

  const out: ContractBook[] = [];
  for (const r of rows) {
    const isbn = String(r[0] ?? "").trim();
    // 헤더/설명행 스킵: ISBN은 13자리 숫자
    if (!/^\d{10,13}$/.test(isbn)) continue;
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

/**
 * 쏠북 Summary / 출판사 폴더 시트에 정산 결과 write-back (선택 기능).
 * 실제 셀 좌표 매핑은 시트 구조 확정 후 구현. 현재는 미연동 시 안내 throw.
 */
export async function appendToSummary(): Promise<void> {
  if (useMock()) {
    throw new Error("목업 모드: 시트 자동 기록은 실데이터 연동 후 사용 가능합니다.");
  }
  // TODO: SUMMARY_SHEET_ID / 월별 컬럼 좌표에 사용/충전/기말잔액 기록
  throw new Error("시트 write-back 좌표 매핑 미구현 (시트 구조 확정 필요)");
}
