import { z } from "zod";

const guid = z.guid();

export function isGuid(value: unknown): value is string {
  return typeof value === "string" && guid.safeParse(value).success;
}

export function textLength(value: string) {
  return Array.from(value.trim()).length;
}
