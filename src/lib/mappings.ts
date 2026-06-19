import { prisma } from "./db";
import { parseCsv } from "./contracts";

/**
 * 기존 bookips 등의 ISBN 매핑을 CSV로 임포트.
 * 컬럼: 사용ISBN, 계약ISBN, (출판사), (교재명)
 * status=confirmed 로 저장되어 다음 정산부터 자동 적용.
 */
export async function importMappingsFromCsv(text: string): Promise<{ count: number }> {
  const rows = parseCsv(text);
  const seen = new Set<string>();
  const items = rows
    .map((r) => ({
      usedIsbn: String(r[0] ?? "").trim(),
      contractIsbn: String(r[1] ?? "").trim(),
      publisher: String(r[2] ?? "").trim(),
      bookName: String(r[3] ?? "").trim(),
      status: "confirmed" as const,
    }))
    .filter((x) => /^\d{10,13}$/.test(x.usedIsbn) && /^\d{10,13}$/.test(x.contractIsbn))
    .filter((x) => (seen.has(x.usedIsbn) ? false : (seen.add(x.usedIsbn), true)));

  await prisma.$transaction([
    prisma.isbnMapping.deleteMany({ where: { usedIsbn: { in: items.map((i) => i.usedIsbn) } } }),
    prisma.isbnMapping.createMany({ data: items }),
  ]);
  return { count: items.length };
}
