import { NextResponse } from "next/server";
import { createPersistentChat, deletePersistentChat, leavePersistentChat, updatePersistentChat } from "@/lib/solo-leveling-store";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      members?: string[];
      agentHandles?: string[];
      projectRefs?: string[];
      author?: string;
    };
    if (!body.title || !body.author) {
      return NextResponse.json({ error: "title and author are required" }, { status: 400 });
    }

    const chat = await createPersistentChat({
      title: body.title,
      description: body.description,
      members: body.members ?? [],
      agentHandles: body.agentHandles ?? [],
      projectRefs: body.projectRefs ?? [],
      author: body.author,
    });

    return NextResponse.json({ chat });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create chat" },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { chatId?: string; actor?: string; adminUsername?: string };
    if (!body.chatId) {
      return NextResponse.json({ error: "chatId is required" }, { status: 400 });
    }
    if (!body.actor) {
      return NextResponse.json({ error: "actor is required" }, { status: 400 });
    }

    const result = await deletePersistentChat({ chatId: body.chatId, actor: body.actor, adminUsername: body.adminUsername });
    if (!result.nextChat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete chat";
    return NextResponse.json(
      { error: message },
      { status: /Only the chat owner or host/i.test(message) ? 403 : 502 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      chatId?: string;
      title?: string;
      description?: string;
      members?: string[];
      agentHandles?: string[];
      projectRefs?: string[];
      action?: "leave";
      actor?: string;
    };
    if (!body.chatId) {
      return NextResponse.json({ error: "chatId is required" }, { status: 400 });
    }

    if (body.action === "leave") {
      if (!body.actor) {
        return NextResponse.json({ error: "actor is required" }, { status: 400 });
      }
      const chat = await leavePersistentChat({ chatId: body.chatId, actor: body.actor });
      if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
      return NextResponse.json({ chat });
    }

    const chat = await updatePersistentChat({
      chatId: body.chatId,
      title: body.title,
      description: body.description,
      members: body.members,
      agentHandles: body.agentHandles,
      projectRefs: body.projectRefs,
    });

    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    return NextResponse.json({ chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update chat";
    return NextResponse.json(
      { error: message },
      { status: /Only chat members|Chat owners can delete/i.test(message) ? 403 : 502 },
    );
  }
}
