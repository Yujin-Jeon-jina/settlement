import { NextRequest, NextResponse } from "next/server";
import { getContracts, importContractsFromCsv, upsertContract } from "@/lib/contracts";

export async function GET() {
  try {
    const contracts = await getContracts();
    return NextResponse.json({ count: contracts.length, contracts });
  } catch (e) {
    return NextResponse.json({ error: String(e), contracts: [] }, { status: 200 });
  }
}

/** IP LIST CSV 업로드 → Contract 테이블 교체 */
export async function POST(req: NextRequest) {
  const { csv } = (await req.json().catch(() => ({}))) as { csv?: string };
  if (!csv || !csv.trim()) {
    return NextResponse.json({ error: "csv 내용이 비어 있습니다." }, { status: 400 });
  }
  try {
    const { count } = await importContractsFromCsv(csv);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** 수동 입력: 단일 계약 교재 추가/수정 */
export async function PUT(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as {
    isbn?: string;
    publisher?: string;
    title?: string;
    bookPrice?: number;
  };
  if (!b.isbn || !b.title) {
    return NextResponse.json({ error: "isbn, title 필요" }, { status: 400 });
  }
  try {
    await upsertContract({
      isbn: b.isbn,
      publisher: b.publisher ?? "",
      title: b.title,
      bookPrice: Number(b.bookPrice ?? 0),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
