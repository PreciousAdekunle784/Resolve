// TEST-ONLY signing keys for the local mock backend. Not secrets: they only
// work against tests/e2e/mock-backend.mjs.
import { createHmac } from "node:crypto";

export const JWT_SECRET = "resolve-e2e-test-secret-not-for-production-use-0123456789";
const b64url = (s) => Buffer.from(s).toString("base64url");

export function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

export const ANON_KEY = signJwt({ role: "anon", iss: "mock", iat: 1700000000, exp: 4102444800 });
export const SERVICE_KEY = signJwt({ role: "service_role", iss: "mock", iat: 1700000000, exp: 4102444800 });
