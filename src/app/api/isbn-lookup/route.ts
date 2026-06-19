import { NextRequest, NextResponse } from "next/server";
import { aladinLookup } from "@/lib/aladin";
import { getContracts } from "@/lib/contracts";
import { suggestCandidates } from "@/lib/matching";

/**
 * 확인필요 ISBN을 알라딘에서 조회해 도서명을 얻고, 그 도서명으로 계약목록에서
 * 구판/개정판 후보를 다시 추천한다. (수동 인터넷 검색 자동화)
 */
export async function POST(req: NextRequest) {
  const { isbn, usedTitle, publisher } = (await req.json().catch(() => ({}))) as {
    isbn?: string;
    usedTitle?: string;
    publisher?: string;
  };
  if (!isbn) return NextResponse.json({ error: "isbn 필요" }, { status: 400 });

  let info = null;
  let lookupError: string | null = null;
  try {
    info = await aladinLookup(isbn);
  } catch (e) {
    lookupError = String((e as Error).message ?? e);
  }

  const contracts = await getContracts();
  const title = info?.title || usedTitle || isbn;
  // 조회로 얻은 (더 정확한) 제목으로 재매칭, 임계값 낮춰 폭넓게 추천
  const candidates = suggestCandidates(title, publisher ?? info?.publisher ?? null, contracts, {
    threshold: 0.2,
    limit: 8,
  });

  return NextResponse.json({ info, lookupError, lookedUpTitle: info?.title ?? null, candidates });
}
