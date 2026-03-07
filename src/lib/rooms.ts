export const ROOM_NAMES = [
  "ROOM 1",
  "ROOM 2",
  "ROOM 3",
  "ROOM 4",
  "ROOM 5",
  "ROOM 6",
  "ROOM 7",
  "OSCE 1",
  "OSCE 2",
  "OSCE 3",
  "OSCE 4",
  "OSCE 5",
  "OSCE 6",
  "OSCE 7",
  "OSCE 8",
  "SIMMAN 실",
] as const;

export type RoomName = (typeof ROOM_NAMES)[number];

const ROOM_NAME_SET = new Set<string>(ROOM_NAMES);

export function isValidRoomName(value: string): value is RoomName {
  return ROOM_NAME_SET.has(value);
}
