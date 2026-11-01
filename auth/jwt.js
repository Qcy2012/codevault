import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(userId) {
  return jwt.sign({ sub: String(userId) }, SECRET, { expiresIn: EXPIRES_IN });
}

export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, SECRET);
    return Number(payload.sub);
  } catch {
    return null;
  }
}