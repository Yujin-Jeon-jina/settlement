import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
