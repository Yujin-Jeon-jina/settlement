import { NextResponse } from "next/server";
import { fetchContracts } from "@/lib/google";

export async function GET() {
  try {
    const contracts = await fetchContracts();
    return NextResponse.json({ contracts });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
