import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { importMappingsFromCsv } from "@/lib/mappings";

/** 매핑 CSV 일괄 임포트 (사용ISBN, 계약ISBN, [출판사], [교재명]) */
export async function PUT(req: NextRequest) {
  const { csv } = (await req.json().catch(() => ({}))) as { csv?: string };
  if (!csv || !csv.trim()) {
    return NextResponse.json({ error: "csv 내용이 비어 있습니다." }, { status: 400 });
  }
  try {
    const { count } = await importMappingsFromCsv(csv);
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const mappings = await prisma.isbnMapping.findMany({ orderBy: { confirmedAt: "desc" } });
    return NextResponse.json({ mappings });
  } catch (e) {
    return NextResponse.json({ error: String(e), mappings: [] }, { status: 200 });
  }
}

/** 사용 ISBN → 계약 교재 매핑 확정/저장 (다음 달부터 재사용) */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    usedIsbn?: string;
    contractIsbn?: string | null;
    publisher?: string;
    bookName?: string;
    status?: "confirmed" | "unauthorized";
  };
  if (!body.usedIsbn) {
    return NextResponse.json({ error: "usedIsbn 필요" }, { status: 400 });
  }
  try {
    const status = body.status ?? "confirmed";
    const mapping = await prisma.isbnMapping.upsert({
      where: { usedIsbn: body.usedIsbn },
      create: {
        usedIsbn: body.usedIsbn,
        contractIsbn: status === "unauthorized" ? null : body.contractIsbn ?? null,
        publisher: body.publisher ?? "",
        bookName: body.bookName ?? "",
        status,
      },
      update: {
        contractIsbn: status === "unauthorized" ? null : body.contractIsbn ?? null,
        status,
      },
    });
    return NextResponse.json({ mapping });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const usedIsbn = req.nextUrl.searchParams.get("usedIsbn");
  if (!usedIsbn) return NextResponse.json({ error: "usedIsbn 필요" }, { status: 400 });
  try {
    await prisma.isbnMapping.delete({ where: { usedIsbn } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
