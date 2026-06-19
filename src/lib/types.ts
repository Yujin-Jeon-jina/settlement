// 정산 도메인 공용 타입

export type MatchStatus = "auto" | "confirmed" | "unauthorized" | "unmatched";

/** BigQuery에서 집계한 사용 ISBN 단위 사용량 (계약 매칭 전) */
export interface UsageRow {
  publisher: string | null;
  usedIsbn: string;
  bookName: string | null;
  userCount: number;
  /** (선택) BigQuery 쿼리가 단가를 함께 반환하면 사용. 없으면 계약 bookPrice 사용. */
  unitPrice?: number | null;
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
  unitPrice: number; // 계약 bookPrice
  amount: number; // userCount * unitPrice
  candidates: MatchCandidate[]; // 미확정 시 추천 후보
}

export interface PublisherSummary {
  publisher: string;
  totalAmount: number;
  lineCount: number;
  unauthorizedAmount: number;
}
