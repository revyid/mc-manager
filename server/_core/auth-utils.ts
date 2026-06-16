import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Hashes a password using Node's built-in scrypt algorithm.
 * Returns a string in the format "salt:hash".
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

/**
 * Verifies a password against a stored "salt:hash" string.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(":");
    if (!salt || !hash) return false;

    const key = scryptSync(password, salt, 64);
    const hashBuffer = Buffer.from(hash, "hex");

    // timingSafeEqual helps prevent timing attacks
    return timingSafeEqual(hashBuffer, key);
  } catch (error) {
    return false;
  }
}
