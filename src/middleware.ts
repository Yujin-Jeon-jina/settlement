import { NextRequest, NextResponse } from "next/server";
import { isValidToken, SESSION_COOKIE } from "@/lib/auth";

// 정산 메뉴와 데이터 API는 비밀번호 세션이 있어야만 접근 가능.
const PROTECTED = ["/settlement", "/api/usage", "/api/contracts", "/api/mappings", "/api/settlement", "/api/export", "/api/verify", "/api/isbn-lookup", "/api/balances"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await isValidToken(token)) return NextResponse.next();

  // API는 401, 페이지는 로그인으로 리다이렉트
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/settlement/:path*", "/api/:path*"],
};
