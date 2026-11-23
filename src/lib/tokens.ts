import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";

/**
 * Guest invitation links.
 *   token = base64url(HMAC-SHA256(INVITE_TOKEN_SECRET, "guest:<id>:<version>"))   (256 bits)
 * Only sha256(token) is stored in the database. The server can re-derive the link
 * for the organizer at any time, and bumping `version` rotates (invalidates) it.
 * Without the secret, tokens can neither be guessed nor enumerated.
 */
function secret(): string {
  const s = process.env.INVITE_TOKEN_SECRET;
  if (!s || s.length < 32) {
    throw new Error("INVITE_TOKEN_SECRET is missing or shorter than 32 characters");
  }
  return s;
}

export function guestToken(guestId: string, version: number): string {
  return createHmac("sha256", secret()).update(`guest:${guestId}:${version}`).digest("base64url");
}

export function sha256Hex(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function guestTokenHash(guestId: string, version: number): string {
  return sha256Hex(guestToken(guestId, version));
}

/** One-time random token (workspace invitations). Only its hash is stored. */
export function randomToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: sha256Hex(token) };
}

/** Rate-limit key for public endpoints: hashed IP, never stored raw. */
export function clientKey(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", secret()).update(`ip:${ip}`).digest("hex").slice(0, 32);
}
