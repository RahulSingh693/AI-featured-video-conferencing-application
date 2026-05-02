import { randomBytes } from "crypto";

export function generateMeetingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(9);
  for (let i = 0; i < 9; i++) {
    code += chars[bytes[i] % chars.length];
    if (i === 2 || i === 5) code += "-";
  }
  return code;
}
