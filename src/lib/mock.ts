import type { ContractBook, UsageRow } from "./types";

// 실데이터 연동 전 UI/계산 검증용 목업.
// bookips Pivot 2026.06 표본을 축약 반영.

export const MOCK_USAGE: UsageRow[] = [
  { publisher: "NE능률", usedIsbn: "9791125337072", bookName: "Grammar Inside 그래머 인사이드 Level 1", userCount: 3 },
  { publisher: "NE능률", usedIsbn: "9791125347620", bookName: "리딩튜터 주니어 4 (개정판)", userCount: 2 },
  { publisher: "NE능률", usedIsbn: "9791125342878", bookName: "1316 Reading Level 1", userCount: 1 },
  { publisher: "개념원리", usedIsbn: "9788961334839", bookName: "개념원리 고등 공통수학1(2025년 고1 적용)", userCount: 15 },
  { publisher: "개념원리", usedIsbn: "9788961335973", bookName: "개념원리 대수(2026)", userCount: 8 },
  { publisher: "쎄듀", usedIsbn: "9791125000001", bookName: "쎄듀 천일문 기본 (개정판)", userCount: 4 },
  { publisher: "마더텅", usedIsbn: "9791175631205", bookName: "마더텅 수능기출문제집 확률과 통계(2026)", userCount: 2 },
  { publisher: "수경출판사", usedIsbn: "9791162409183", bookName: "Xistory 자이스토리 고3 수학 2 (2026년)", userCount: 3 },
];

export const MOCK_CONTRACTS: ContractBook[] = [
  { isbn: "9791125337072", publisher: "NE능률", title: "(2021 개정) Grammar Inside Level 1", bookPrice: 15500, startDate: "2024.01.01", endDate: "2024.12.31" },
  { isbn: "9791125347606", publisher: "NE능률", title: "리딩튜터 주니어 2", bookPrice: 15000, startDate: "2024.01.01", endDate: "2024.12.31" },
  { isbn: "9791125342878", publisher: "NE능률", title: "(2023 개정) 1316 Reading Level 1", bookPrice: 14000, startDate: "2024.01.01", endDate: "2024.12.31" },
  { isbn: "9788961334839", publisher: "개념원리", title: "개념원리 고등 공통수학1", bookPrice: 19000, startDate: "2024.01.01", endDate: "2026.12.31" },
  { isbn: "9788961335973", publisher: "개념원리", title: "개념원리 대수", bookPrice: 19000, startDate: "2024.01.01", endDate: "2026.12.31" },
  { isbn: "9791125900001", publisher: "쎄듀", title: "천일문 기본", bookPrice: 15000, startDate: "2024.01.01", endDate: "2026.12.31" },
  { isbn: "9791175631205", publisher: "마더텅", title: "마더텅 수능기출문제집 확률과 통계", bookPrice: 17900, startDate: "2024.01.01", endDate: "2026.12.31" },
];
