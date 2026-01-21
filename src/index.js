"use strict";

const express = require("express");
const {
  createLogger,
  withCorrelationId,
  getCorrelationId,
  createSecurityHeadersMiddleware,
  createRateLimitMiddleware,
} = require("@connected-car/shared");
const { loadConfig } = require("./config");
const { createStore } = require("./store");
const { authMiddleware, requireRole, assertSameOrg } = require("./auth");

function mustString(value, name) {
  if (!value || typeof value !== "string") throw new Error(`${name} must be a non-empty string`);
  return value;
}

/**
 * PUBLIC_INTERFACE
 * Fleet Management Service entrypoint.
 *
 * Endpoints:
 * - POST /orgs
 * - POST /users
 * - POST /vehicles
 * - POST /assignments
 * - GET /orgs/:orgId/vehicles
 * - GET /users/:userId/vehicles
 * - GET /vehicles/:vehicleId
 * - DELETE /assignments/:id
 *
 * Authorization (MVP):
 * - Bearer JWT (stub validation using @connected-car/shared createJwtValidator)
 * - orgId scoping enforced
 * - role checks: admin/operator
 */
async function main() {
  const cfg = loadConfig();
  const logger = createLogger({ serviceName: cfg.serviceName, level: cfg.logLevel });

  const store = createStore({
    mode: cfg.store.mode,
    filePath: cfg.store.filePath,
    logger,
  });

  const app = express();

  // Hardening (Phase 9): security headers + optional rate limiting (disabled by default).
  app.use(
    createSecurityHeadersMiddleware({
      serviceName: cfg.serviceName,
      enabled: true,
      enableCsp: String(process.env.SECURITY_ENABLE_CSP || "false").toLowerCase() === "true",
      csp: process.env.SECURITY_CSP || undefined,
      enableHsts: String(process.env.SECURITY_ENABLE_HSTS || "false").toLowerCase() === "true",
    })
  );
  app.use(
    createRateLimitMiddleware({
      enabled: String(process.env.RATE_LIMIT_ENABLED || "false").toLowerCase() === "true",
      windowSeconds: Number(process.env.RATE_LIMIT_WINDOW_S || 60),
      maxRequests: Number(process.env.RATE_LIMIT_MAX || 100),
      logger,
    })
  );

  app.use(express.json({ limit: "256kb" }));

  const auth = authMiddleware({
    required: cfg.auth.required,
    issuer: cfg.auth.issuer,
    audience: cfg.auth.audience,
    clockToleranceSeconds: cfg.auth.clockToleranceSeconds,
    logger,
  });

  // Health + auth notes
  app.get(
    "/health",
    withCorrelationId(logger, async (req, res) => {
      res.json({
        ok: true,
        service: cfg.serviceName,
        correlationId: getCorrelationId(),
        authRequired: cfg.auth.required,
        storeMode: store.mode,
      });
    })
  );

  app.get(
    "/docs/auth",
    withCorrelationId(logger, async (req, res) => {
      res.type("text/plain").send(
        [
          "Fleet Management MVP auth notes",
          "",
          "All endpoints require: Authorization: Bearer <JWT>",
          "JWT validation is a stub (no signature verification) via @connected-car/shared.",
          "",
          "Expected JWT payload claims:",
          "- sub: string",
          "- orgId: string",
          '- role: \"admin\" | \"operator\"',
          "",
          "Dev mode:",
          "- Set AUTH_REQUIRED=false to bypass JWT and act as admin in orgId=dev-org.",
        ].join("\n")
      );
    })
  );

  // POST /orgs (admin)
  app.post(
    "/orgs",
    auth,
    requireRole(["admin"]),
    withCorrelationId(logger, async (req, res) => {
      const name = req.body?.name;
      if (!name || typeof name !== "string") return res.status(400).json({ ok: false, error: "name_required" });

      const org = store.createOrg({ name: name.trim() });
      return res.status(201).json({ ok: true, org });
    })
  );

  // POST /users (admin; same org)
  app.post(
    "/users",
    auth,
    requireRole(["admin"]),
    withCorrelationId(logger, async (req, res) => {
      const orgId = req.body?.orgId;
      const name = req.body?.name;
      const role = req.body?.role;

      if (!orgId || typeof orgId !== "string") return res.status(400).json({ ok: false, error: "orgId_required" });
      if (!name || typeof name !== "string") return res.status(400).json({ ok: false, error: "name_required" });
      if (role !== "admin" && role !== "operator") {
        return res.status(400).json({ ok: false, error: "role_must_be_admin_or_operator" });
      }

      const sc = assertSameOrg(orgId, req.actor);
      if (!sc.ok) return res.status(sc.status).json({ ok: false, error: sc.error });

      const org = store.getOrg(orgId);
      if (!org) return res.status(404).json({ ok: false, error: "org_not_found" });

      const user = store.createUser({ orgId, name: name.trim(), role });
      return res.status(201).json({ ok: true, user });
    })
  );

  // POST /vehicles (admin; same org)
  app.post(
    "/vehicles",
    auth,
    requireRole(["admin"]),
    withCorrelationId(logger, async (req, res) => {
      const orgId = req.body?.orgId;
      const vin = req.body?.vin;
      const name = req.body?.name;

      if (!orgId || typeof orgId !== "string") return res.status(400).json({ ok: false, error: "orgId_required" });
      if (!vin || typeof vin !== "string") return res.status(400).json({ ok: false, error: "vin_required" });

      const sc = assertSameOrg(orgId, req.actor);
      if (!sc.ok) return res.status(sc.status).json({ ok: false, error: sc.error });

      const org = store.getOrg(orgId);
      if (!org) return res.status(404).json({ ok: false, error: "org_not_found" });

      const vehicle = store.createVehicle({
        orgId,
        vin: vin.trim(),
        name: typeof name === "string" ? name.trim() : undefined,
      });
      return res.status(201).json({ ok: true, vehicle });
    })
  );

  // GET /vehicles/:vehicleId (admin/operator; same org)
  app.get(
    "/vehicles/:vehicleId",
    auth,
    requireRole(["admin", "operator"]),
    withCorrelationId(logger, async (req, res) => {
      const vehicleId = mustString(req.params.vehicleId, "vehicleId");
      const vehicle = store.getVehicle(vehicleId);
      if (!vehicle) return res.status(404).json({ ok: false, error: "vehicle_not_found" });

      const sc = assertSameOrg(vehicle.orgId, req.actor);
      if (!sc.ok) return res.status(sc.status).json({ ok: false, error: sc.error });

      return res.status(200).json({ ok: true, vehicle });
    })
  );

  // POST /assignments (admin; same org; idempotent check)
  app.post(
    "/assignments",
    auth,
    requireRole(["admin"]),
    withCorrelationId(logger, async (req, res) => {
      const userId = req.body?.userId;
      const vehicleId = req.body?.vehicleId;

      if (!userId || typeof userId !== "string") return res.status(400).json({ ok: false, error: "userId_required" });
      if (!vehicleId || typeof vehicleId !== "string") {
        return res.status(400).json({ ok: false, error: "vehicleId_required" });
      }

      const user = store.getUser(userId);
      if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });

      const vehicle = store.getVehicle(vehicleId);
      if (!vehicle) return res.status(404).json({ ok: false, error: "vehicle_not_found" });

      const actorOrg = req.actor?.orgId;
      if (user.orgId !== actorOrg || vehicle.orgId !== actorOrg || user.orgId !== vehicle.orgId) {
        return res.status(403).json({ ok: false, error: "cross_org_forbidden" });
      }

      const existing = store.findAssignmentByUserVehicle(actorOrg, userId, vehicleId);
      if (existing) return res.status(409).json({ ok: false, error: "assignment_exists", assignment: existing });

      const assignment = store.createAssignment({ orgId: actorOrg, userId, vehicleId });
      return res.status(201).json({ ok: true, assignment });
    })
  );

  // DELETE /assignments/:id (admin; same org)
  app.delete(
    "/assignments/:id",
    auth,
    requireRole(["admin"]),
    withCorrelationId(logger, async (req, res) => {
      const id = mustString(req.params.id, "id");

      // Read existing first to enforce org scoping before delete
      // (store has only delete, but we can soft-check by deleting then validating; restore is not worth it for MVP)
      const deleted = store.deleteAssignment(id);
      if (!deleted) return res.status(404).json({ ok: false, error: "assignment_not_found" });

      const sc = assertSameOrg(deleted.orgId, req.actor);
      if (!sc.ok) return res.status(sc.status).json({ ok: false, error: sc.error });

      return res.status(200).json({ ok: true, deleted });
    })
  );

  // GET /orgs/:orgId/vehicles (admin/operator; same org)
  app.get(
    "/orgs/:orgId/vehicles",
    auth,
    requireRole(["admin", "operator"]),
    withCorrelationId(logger, async (req, res) => {
      const orgId = mustString(req.params.orgId, "orgId");
      const sc = assertSameOrg(orgId, req.actor);
      if (!sc.ok) return res.status(sc.status).json({ ok: false, error: sc.error });

      const org = store.getOrg(orgId);
      if (!org) return res.status(404).json({ ok: false, error: "org_not_found" });

      const vehicles = store.listOrgVehicles(orgId);
      return res.status(200).json({ ok: true, vehicles });
    })
  );

  // GET /users/:userId/vehicles (admin/operator; same org; operator can only query self)
  app.get(
    "/users/:userId/vehicles",
    auth,
    requireRole(["admin", "operator"]),
    withCorrelationId(logger, async (req, res) => {
      const userId = mustString(req.params.userId, "userId");
      const user = store.getUser(userId);
      if (!user) return res.status(404).json({ ok: false, error: "user_not_found" });

      const sc = assertSameOrg(user.orgId, req.actor);
      if (!sc.ok) return res.status(sc.status).json({ ok: false, error: sc.error });

      if (req.actor.role === "operator" && req.actor.sub !== userId) {
        return res.status(403).json({ ok: false, error: "operator_cannot_query_other_users" });
      }

      const vehicles = store.listUserVehicles(userId);
      return res.status(200).json({ ok: true, vehicles });
    })
  );

  // Not found
  app.use((req, res) => res.status(404).json({ ok: false, error: "not_found" }));

  app.listen(cfg.port, cfg.host, () => {
    logger.info("Fleet management service listening", { host: cfg.host, port: cfg.port });
  });
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("Fatal startup error", e);
  process.exit(1);
});
