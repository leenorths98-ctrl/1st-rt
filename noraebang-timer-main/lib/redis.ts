import { Redis } from "@upstash/redis";
import { ROOM_COUNT, ROOM_ID_START } from "@/lib/constants";

export const redis = process.env.UPSTASH_REDIS_REST_URL
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

export const ROOMS_KEY = "noraebang:rooms";

export type Room = {
  id: number; // 101 ~ 118
  status: "idle" | "running" | "waiting";
  endTime: number | null; // epoch ms
  manager: string | null;
};

let memoryRooms: Room[] | null = null;

export function defaultRooms(): Room[] {
  return Array.from({ length: ROOM_COUNT }, (_, i) => ({
    id: ROOM_ID_START + i,
    status: "idle",
    endTime: null,
    manager: null,
  }));
}

function normalizeRooms(data: Room[]): Room[] {
  return data.map((r, i) => ({
    id: typeof r?.id === "number" ? r.id : ROOM_ID_START + i,
    status:
      r?.status === "running" || r?.status === "waiting" ? r.status : "idle",
    endTime: r?.endTime ?? null,
    manager: r?.manager ?? null,
  }));
}

export async function getRooms(): Promise<Room[]> {
  if (!redis) {
    if (!memoryRooms) memoryRooms = defaultRooms();
    return memoryRooms;
  }
  const data = await redis.get<Room[]>(ROOMS_KEY);
  if (!data || !Array.isArray(data) || data.length !== ROOM_COUNT) {
    const rooms = defaultRooms();
    await redis.set(ROOMS_KEY, rooms);
    return rooms;
  }
  return normalizeRooms(data);
}

export async function saveRooms(rooms: Room[]): Promise<void> {
  if (!redis) {
    memoryRooms = rooms;
    return;
  }
  await redis.set(ROOMS_KEY, rooms);
}
