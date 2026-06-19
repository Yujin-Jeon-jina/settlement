import { NextRequest, NextResponse } from "next/server";
import { issueToken, verifyPassword, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (!password || !verifyPassword(password)) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await issueToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

// 진단용(임시): 비밀번호 값은 노출하지 않고 환경변수 설정 상태만 확인.
export async function GET() {
  const pw = process.env.SETTLEMENT_PASSWORD || "";
  return NextResponse.json({
    settlementPasswordConfigured: !!pw.trim(),
    settlementPasswordLength: pw.trim().length,
    sessionSecretConfigured: !!(process.env.SESSION_SECRET || "").trim(),
    databaseUrlConfigured: !!(process.env.DATABASE_URL || "").trim(),
    googleOauthConfigured: !!(process.env.GOOGLE_OAUTH_CREDENTIALS || "").trim(),
    useMockData: process.env.USE_MOCK_DATA ?? null,
    bigqueryProjectId: process.env.BIGQUERY_PROJECT_ID ?? null,
  });
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
