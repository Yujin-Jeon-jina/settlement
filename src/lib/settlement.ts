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

/** 명시적 '미승인(정산 제외)'으로 볼 status 값 집합 (기본 DENIED, EXPIRED) */
function deniedStatuses(): Set<string> {
  const raw = process.env.CONTRACT_DENIED_STATUSES || "DENIED,EXPIRED,REJECT";
  return new Set(raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean));
}

/**
 * IP LIST가 계약 마스터이므로, ISBN이 IP LIST에 있으면 정산 대상으로 본다.
 * status는 '있을 때만' 참고해 명시적 DENIED/EXPIRED만 제외한다(피봇 복사 CSV처럼
 * status 컬럼이 없어도 정산되도록). 예전처럼 status=ALLOWED를 강제하려면
 * env CONTRACT_REQUIRE_ALLOWED=true 로 되돌릴 수 있다.
 */
function requireAllowed(): boolean {
  return String(process.env.CONTRACT_REQUIRE_ALLOWED || "").toLowerCase() === "true";
}

/** 이 사용행이 계약 승인 상태인지 (IP LIST 존재는 호출부에서 별도 확인) */
function isApproved(status: string | null | undefined): boolean {
  const s = (status || "").toUpperCase();
  if (requireAllowed()) return activeStatuses().has(s);
  return !deniedStatuses().has(s); // 빈값/ALLOWED/기타 → 승인, DENIED/EXPIRED만 제외
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

  return usage.map((u) => {
    const bookName = u.bookName || u.usedIsbn;
    const publisher = u.publisher || "(미상)";
    const approved = isApproved(u.status); // 명시적 DENIED/EXPIRED만 제외(기본)
    const base = {
      usedIsbn: u.usedIsbn,
      publisher,
      bookName,
      userCount: u.userCount,
      contractStatus: u.status ?? null,
    };

    // 1) 저장된 확정/미허가 매핑 (사람이 한번 정한 건 그대로)
    const saved = storedByUsed.get(u.usedIsbn);
    if (saved) {
      if (saved.status === "unauthorized") {
        return { ...base, matchStatus: "unauthorized", contractIsbn: null, contractBookName: null, unitPrice: 0, amount: 0, candidates: [] };
      }
      const c = saved.contractIsbn ? contractByIsbn.get(saved.contractIsbn) : undefined;
      const price = c?.bookPrice ?? 0; // 단가 = IP LIST bookPrice
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

    // 2) 정산 대상 = IP LIST(계약 마스터)에 ISBN 정확 매칭. status가 명시적 DENIED/EXPIRED면 제외.
    const exact = contractByIsbn.get(u.usedIsbn);
    if (exact && approved) {
      const price = exact.bookPrice; // 단가 = IP LIST bookPrice
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

    // 3) 그 외(개정판=IP LIST에 ISBN 없음 / 미승인) → 확인필요: IP LIST에서 제목 유사 후보 추천
    //    사람이 후보 확정 시 정산, 또는 미허가 처리. (미허가/미정산은 별도 목록으로 확인)
    const candidates = suggestCandidates(bookName, u.publisher, contracts);
    return {
      ...base,
      matchStatus: "unmatched",
      contractIsbn: null,
      contractBookName: null,
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
      { publisher: l.publisher, totalAmount: 0, lineCount: 0, unauthorizedAmount: 0, totalUsers: 0 };
    s.lineCount += 1;
    s.totalAmount += l.amount;
    if (l.matchStatus === "auto" || l.matchStatus === "confirmed") s.totalUsers += l.userCount;
    if (l.matchStatus === "unauthorized") s.unauthorizedAmount += l.unitPrice * l.userCount;
    map.set(l.publisher, s);
  }
  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}
