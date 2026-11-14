import { NextRequest, NextResponse } from "next/server";
import { getRooms, saveRooms, defaultRooms } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const rooms = await getRooms();
  return NextResponse.json({ rooms, serverTime: Date.now() });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action, roomId, minutes } = body as {
    action: "add" | "reset" | "resetAll";
    roomId?: number;
    minutes?: number;
  };

  const rooms = await getRooms();

  if (action === "resetAll") {
    const fresh = defaultRooms();
    await saveRooms(fresh);
    return NextResponse.json({ rooms: fresh, serverTime: Date.now() });
  }

  if (typeof roomId !== "number") {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  const idx = rooms.findIndex((r) => r.id === roomId);
  if (idx === -1) {
    return NextResponse.json({ error: "room not found" }, { status: 404 });
  }

  const room = rooms[idx];
  const now = Date.now();

  if (action === "add") {
    const addMs = (minutes ?? 0) * 60 * 1000;
    if (room.status === "running" && room.endTime) {
      room.endTime = room.endTime + addMs;
    } else {
      room.status = "running";
      room.endTime = now + addMs;
    }
  } else if (action === "reset") {
    room.status = "idle";
    room.endTime = null;
  } else {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  rooms[idx] = room;
  await saveRooms(rooms);
  return NextResponse.json({ rooms, serverTime: Date.now() });
}
