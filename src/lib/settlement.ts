import type {
  ContractBook,
  PublisherSummary,
  SettlementLineDraft,
  UsageRow,
} from "./types";
import { suggestCandidates } from "./matching";

interface StoredMapping {
  usedIsbn: string;
  contractIsbn: string | null;
  status: "confirmed" | "unauthorized";
}

/**
 * 사용량 + 계약목록 + 저장된 확정매핑을 결합해 정산 라인 초안을 만든다.
 * 매칭 우선순위: 저장매핑 → ISBN 정확일치(auto) → 제목 유사 후보 추천(unmatched).
 */
export function buildSettlementDraft(
  usage: UsageRow[],
  contracts: ContractBook[],
  stored: StoredMapping[]
): SettlementLineDraft[] {
  const contractByIsbn = new Map(contracts.map((c) => [c.isbn, c]));
  const storedByUsed = new Map(stored.map((m) => [m.usedIsbn, m]));

  return usage.map((u) => {
    const bookName = u.bookName || u.usedIsbn;
    const publisher = u.publisher || "(미상)";
    const base = { usedIsbn: u.usedIsbn, publisher, bookName, userCount: u.userCount };

    // 1) 저장된 확정/미허가 매핑
    const saved = storedByUsed.get(u.usedIsbn);
    if (saved) {
      if (saved.status === "unauthorized") {
        return { ...base, matchStatus: "unauthorized", contractIsbn: null, unitPrice: 0, amount: 0, candidates: [] };
      }
      const c = saved.contractIsbn ? contractByIsbn.get(saved.contractIsbn) : undefined;
      const price = c?.bookPrice ?? 0;
      return {
        ...base,
        matchStatus: "confirmed",
        contractIsbn: saved.contractIsbn,
        unitPrice: price,
        amount: price * u.userCount,
        candidates: [],
      };
    }

    // 2) ISBN 정확 일치
    const exact = contractByIsbn.get(u.usedIsbn);
    if (exact) {
      return {
        ...base,
        matchStatus: "auto",
        contractIsbn: exact.isbn,
        unitPrice: exact.bookPrice,
        amount: exact.bookPrice * u.userCount,
        candidates: [],
      };
    }

    // 3) 제목 유사 후보 추천 → 사람이 확정 필요
    const candidates = suggestCandidates(bookName, u.publisher, contracts);
    return {
      ...base,
      matchStatus: "unmatched",
      contractIsbn: null,
      unitPrice: 0,
      amount: 0,
      candidates,
    };
  });
}

export function summarize(lines: SettlementLineDraft[]): PublisherSummary[] {
  const map = new Map<string, PublisherSummary>();
  for (const l of lines) {
    const s =
      map.get(l.publisher) ??
      { publisher: l.publisher, totalAmount: 0, lineCount: 0, unauthorizedAmount: 0 };
    s.lineCount += 1;
    s.totalAmount += l.amount;
    if (l.matchStatus === "unauthorized") s.unauthorizedAmount += l.unitPrice * l.userCount;
    map.set(l.publisher, s);
  }
  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}
