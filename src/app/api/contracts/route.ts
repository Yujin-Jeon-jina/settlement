import { NextRequest, NextResponse } from "next/server";
import { getContracts, countContracts, importContractsFromCsv } from "@/lib/contracts";

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
