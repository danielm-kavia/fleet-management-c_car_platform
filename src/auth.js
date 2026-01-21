"use strict";

const { extractBearerToken, createJwtValidator } = require("@connected-car/shared");

const jwtValidator = createJwtValidator();

/**
 * @typedef {"admin"|"operator"} Role
 */

/**
 * @typedef {Object} Actor
 * @property {string} sub
 * @property {string} orgId
 * @property {Role} role
 * @property {any} rawClaims
 */

/**
 * PUBLIC_INTERFACE
 * Express middleware: authenticate via Bearer token (JWT stub from @connected-car/shared).
 *
 * Expected token claims (payload):
 * - sub: string
 * - orgId: string
 * - role: "admin" | "operator"
 *
 * When AUTH_REQUIRED=false, falls back to a dev actor:
 * - sub="dev-user", orgId="dev-org", role="admin"
 *
 * @param {{ required: boolean, issuer?: string, audience?: string|string[], clockToleranceSeconds: number, logger: any }} options
 */
function authMiddleware(options) {
  return async function auth(req, res, next) {
    try {
      if (!options.required) {
        req.actor = { sub: "dev-user", orgId: "dev-org", role: "admin", rawClaims: {} };
        return next();
      }

      const token = extractBearerToken(req.header("authorization"));
      if (!token) return res.status(401).json({ ok: false, error: "missing_bearer_token" });

      const validation = await jwtValidator.validate(token, {
        issuer: options.issuer,
        audience: options.audience,
        clockToleranceSeconds: options.clockToleranceSeconds,
      });

      if (!validation.ok) {
        return res.status(401).json({ ok: false, error: validation.errorCode || "invalid_token" });
      }

      const claims = validation.payload || {};
      const sub = claims.sub;
      const orgId = claims.orgId;
      const role = claims.role;

      if (!sub || typeof sub !== "string") return res.status(401).json({ ok: false, error: "missing_sub" });
      if (!orgId || typeof orgId !== "string") return res.status(403).json({ ok: false, error: "missing_orgId" });
      if (role !== "admin" && role !== "operator") {
        return res.status(403).json({ ok: false, error: "missing_or_invalid_role" });
      }

      req.actor = { sub, orgId, role, rawClaims: claims };
      return next();
    } catch (e) {
      options?.logger?.warn?.("Auth middleware error", { error: String(e?.message || e) });
      return res.status(500).json({ ok: false, error: "auth_error" });
    }
  };
}

/**
 * PUBLIC_INTERFACE
 * Require the actor to have one of the specified roles.
 * @param {Role[]} roles
 */
function requireRole(roles) {
  return function requireRoleMiddleware(req, res, next) {
    const actor = req.actor;
    if (!actor) return res.status(401).json({ ok: false, error: "unauthenticated" });
    if (!roles.includes(actor.role)) return res.status(403).json({ ok: false, error: "forbidden_role" });
    return next();
  };
}

/**
 * PUBLIC_INTERFACE
 * Helper to ensure an orgId matches the authenticated actor org.
 * @param {string} orgId
 * @param {Actor} actor
 */
function assertSameOrg(orgId, actor) {
  if (!actor) return { ok: false, status: 401, error: "unauthenticated" };
  if (orgId !== actor.orgId) return { ok: false, status: 403, error: "cross_org_forbidden" };
  return { ok: true, status: 200 };
}

module.exports = { authMiddleware, requireRole, assertSameOrg };
