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

/** book_contracts.status 중 '승인(정산대상)'으로 볼 값 집합 (기본 ALLOWED) */
function activeStatuses(): Set<string> {
  const raw = process.env.CONTRACT_ACTIVE_STATUSES || "ALLOWED";
  return new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
}

/**
 * 사용량 + 계약목록 + 저장된 확정매핑을 결합해 정산 라인 초안을 만든다.
 * 우선순위: 저장매핑 → book_contracts status=ALLOWED(auto) → 계약목록 ISBN 정확일치(auto)
 *           → 제목 유사 후보 추천(unmatched). DENIED/EXPIRED/행없음은 unmatched로 보내 사람이 판단.
 */
export function buildSettlementDraft(
  usage: UsageRow[],
  contracts: ContractBook[],
  stored: StoredMapping[]
): SettlementLineDraft[] {
  const contractByIsbn = new Map(contracts.map((c) => [c.isbn, c]));
  const storedByUsed = new Map(stored.map((m) => [m.usedIsbn, m]));
  const active = activeStatuses();

  return usage.map((u) => {
    const bookName = u.bookName || u.usedIsbn;
    const publisher = u.publisher || "(미상)";
    const base = { usedIsbn: u.usedIsbn, publisher, bookName, userCount: u.userCount, contractStatus: u.status ?? null };

    // 1) 저장된 확정/미허가 매핑
    const saved = storedByUsed.get(u.usedIsbn);
    if (saved) {
      if (saved.status === "unauthorized") {
        return { ...base, matchStatus: "unauthorized", contractIsbn: null, unitPrice: 0, amount: 0, candidates: [] };
      }
      const c = saved.contractIsbn ? contractByIsbn.get(saved.contractIsbn) : undefined;
      const price = u.unitPrice ?? c?.bookPrice ?? 0;
      return {
        ...base,
        matchStatus: "confirmed",
        contractIsbn: saved.contractIsbn,
        contractBookName: c?.title ?? null,
        unitPrice: price,
        amount: price * u.userCount,
        candidates: [],
      };
    }

    // 2) book_contracts status가 승인(ALLOWED) → 자동 정산, 단가 = consumer_price
    const statusUpper = (u.status || "").toUpperCase();
    if (active.has(statusUpper)) {
      const c = contractByIsbn.get(u.usedIsbn);
      const price = u.unitPrice ?? c?.bookPrice ?? 0;
      return {
        ...base,
        matchStatus: "auto",
        contractIsbn: u.usedIsbn,
        contractBookName: c?.title ?? null,
        unitPrice: price,
        amount: price * u.userCount,
        candidates: [],
      };
    }

    // 3) (status 없을 때) 계약목록 ISBN 정확 일치 폴백
    const exact = contractByIsbn.get(u.usedIsbn);
    if (exact && !statusUpper) {
      const price = u.unitPrice ?? exact.bookPrice;
      return {
        ...base,
        matchStatus: "auto",
        contractIsbn: exact.isbn,
        contractBookName: exact.title ?? null,
        unitPrice: price,
        amount: price * u.userCount,
        candidates: [],
      };
    }

    // 4) DENIED/EXPIRED/계약행 없음 → 제목 유사 후보 추천, 사람이 확정/미허가 판단
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
