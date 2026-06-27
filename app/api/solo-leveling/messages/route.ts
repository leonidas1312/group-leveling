import { NextResponse } from "next/server";
import { appendPersistentMessage } from "@/lib/solo-leveling-store";
import type { ChatMessage } from "@/lib/demo-data";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { chatId?: string; message?: ChatMessage };
    if (!body.chatId || !body.message) {
      return NextResponse.json({ error: "chatId and message are required" }, { status: 400 });
    }

    return NextResponse.json({ message: await appendPersistentMessage({ chatId: body.chatId, message: body.message }) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save message" },
      { status: 502 },
    );
  }
}
