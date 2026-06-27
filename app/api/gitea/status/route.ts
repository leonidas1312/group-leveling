import { NextResponse } from "next/server";
import { getGiteaStatus } from "@/lib/gitea";

export async function GET() {
  return NextResponse.json(await getGiteaStatus());
}
