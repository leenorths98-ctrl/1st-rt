import { Redis } from "@upstash/redis";
import { ROOM_COUNT, ROOM_ID_START } from "@/lib/constants";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export const ROOMS_KEY = "noraebang:rooms";

export type Room = {
  id: number; // 101 ~ 118
  status: "idle" | "running";
  endTime: number | null; // epoch ms
};

export function defaultRooms(): Room[] {
  return Array.from({ length: ROOM_COUNT }, (_, i) => ({
    id: ROOM_ID_START + i,
    status: "idle",
    endTime: null,
  }));
}

export async function getRooms(): Promise<Room[]> {
  const data = await redis.get<Room[]>(ROOMS_KEY);
  if (!data || !Array.isArray(data) || data.length !== ROOM_COUNT) {
    const rooms = defaultRooms();
    await redis.set(ROOMS_KEY, rooms);
    return rooms;
  }
  return data;
}

export async function saveRooms(rooms: Room[]): Promise<void> {
  await redis.set(ROOMS_KEY, rooms);
}
