// 정산 도메인 공용 타입

export type MatchStatus = "auto" | "confirmed" | "unauthorized" | "unmatched";

/** BigQuery에서 집계한 사용 ISBN 단위 사용량 (계약 매칭 전) */
export interface UsageRow {
  publisher: string | null;
  usedIsbn: string;
  bookName: string | null;
  userCount: number;
  /** book_contracts.consumer_price (=단가). 없으면 계약 bookPrice로 폴백. */
  unitPrice?: number | null;
  /** book_contracts.status (ALLOWED=승인, DENIED/EXPIRED=미승인, null=계약행 없음) */
  status?: string | null;
}

/** 계약 교재 마스터 (계약 목록 시트 1행) */
export interface ContractBook {
  isbn: string;
  publisher: string;
  title: string;
  bookPrice: number;
  startDate: string | null;
  endDate: string | null;
}

/** 매칭 후보 1건 */
export interface MatchCandidate {
  contractIsbn: string;
  publisher: string;
  title: string;
  bookPrice: number;
  score: number; // 0~1 제목 유사도
}

/** 사용량 + 매칭 결과를 합친 정산 라인 (UI/계산 단위) */
export interface SettlementLineDraft {
  usedIsbn: string;
  publisher: string;
  bookName: string;
  userCount: number;
  matchStatus: MatchStatus;
  contractIsbn: string | null;
  unitPrice: number; // consumer_price 또는 계약 bookPrice
  amount: number; // userCount * unitPrice
  candidates: MatchCandidate[]; // 미확정 시 추천 후보
  contractStatus?: string | null; // book_contracts.status (ALLOWED/DENIED/EXPIRED/null)
  contractBookName?: string | null; // 매칭된 계약 교재명 (사용 교재명과 대조용)
}

export interface PublisherSummary {
  publisher: string;
  totalAmount: number;
  lineCount: number;
  unauthorizedAmount: number;
}
