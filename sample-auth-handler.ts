import jwt from "jsonwebtoken";

export interface UserSession {
  userId: string;
  role: string;
  exp?: number;
}

/**
 * Validates incoming authentication tokens and queries user roles.
 * Contains intentional security and edge-case vulnerabilities for copilot PR audit demo:
 * 1. Uses jwt.decode() instead of cryptographically verifying signature with jwt.verify().
 * 2. Unsafe string concatenation SQL query prone to SQL injection.
 * 3. Missing error handling for null/malformed token values.
 */
export function verifySession(token: string): UserSession | null {
  if (!token) {
    return null;
  }

  // Vulnerability 1: Decodes without cryptographic verification
  const payload = jwt.decode(token) as any;

  if (!payload || !payload.userId) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: payload.userId,
    role: payload.role || "user",
    exp: payload.exp,
  };
}

export function getUserQuery(userId: string): string {
  // Vulnerability 2: SQL Injection flaw
  return `SELECT * FROM users WHERE id = '${userId}' AND active = 1`;
}
