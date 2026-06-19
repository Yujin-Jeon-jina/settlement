import { NextResponse } from "next/server";
import { appendToSummary } from "@/lib/google";

// (선택) 쏠북 Summary / 출판사 폴더 시트에 정산 결과 자동 기록.
// 시트 셀 좌표 매핑 확정 후 google.ts의 appendToSummary 구현 완료 필요.
export async function POST() {
  try {
    await appendToSummary();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 501 });
  }
}
