import type { ContractBook, MatchCandidate } from "./types";

/**
 * 제목 정규화: 구판/개정판 매칭을 위해 노이즈 토큰 제거.
 *  - 괄호/대괄호 안 내용 제거: (2023 개정), (with Workbook) 등
 *  - 연도, "개정", "개정판", "with Workbook" 등 제거
 *  - 한/영/숫자만 남기고 소문자화
 */
export function normalizeTitle(raw: string): string {
  if (!raw) return "";
  let s = raw.toLowerCase();
  s = s.replace(/\([^)]*\)/g, " "); // (…)
  s = s.replace(/\[[^\]]*\]/g, " "); // […]
  s = s.replace(/\d{4}\s*개정(판|\s*교육과정)?/g, " ");
  s = s.replace(/개정판|개정|with workbook|workbook/gi, " ");
  s = s.replace(/\b(19|20)\d{2}\b/g, " "); // 연도
  s = s.replace(/[^0-9a-z가-힣]+/g, " "); // 특수문자 → 공백
  return s.replace(/\s+/g, " ").trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeTitle(s).split(" ").filter(Boolean));
}

/** Jaccard 유사도 (0~1) */
export function titleSimilarity(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 사용 교재(usedTitle, usedPublisher)에 대해 계약 목록에서 후보를 점수순으로 반환.
 * 같은 출판사 우선, 제목 유사도로 정렬. threshold 미만은 제외.
 */
export function suggestCandidates(
  usedTitle: string,
  usedPublisher: string | null,
  contracts: ContractBook[],
  opts: { threshold?: number; limit?: number } = {}
): MatchCandidate[] {
  const threshold = opts.threshold ?? 0.34;
  const limit = opts.limit ?? 5;
  const pub = (usedPublisher || "").trim();

  const scored = contracts
    .map((c) => {
      let score = titleSimilarity(usedTitle, c.title);
      // 같은 출판사면 가산점 (출판사명이 다르게 표기될 수 있어 부분일치 허용)
      const samePub =
        pub &&
        (c.publisher.includes(pub) ||
          pub.includes(c.publisher) ||
          normalizeTitle(c.publisher) === normalizeTitle(pub));
      if (samePub) score = Math.min(1, score + 0.1);
      return {
        contractIsbn: c.isbn,
        publisher: c.publisher,
        title: c.title,
        bookPrice: c.bookPrice,
        score,
        samePub,
      };
    })
    .filter((c) => c.score >= threshold)
    .sort((a, b) => {
      if (a.samePub !== b.samePub) return a.samePub ? -1 : 1;
      return b.score - a.score;
    })
    .slice(0, limit);

  return scored.map(({ samePub: _samePub, ...rest }) => rest);
}
