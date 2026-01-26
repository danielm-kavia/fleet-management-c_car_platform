"use strict";

const fs = require("fs");
const path = require("path");
const { httpJson } = require("./helpers/httpClient");

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function readJsonFixture(relPath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relPath), "utf-8"));
}

describe("integration: fleet-management → vehicle-state flow (SWE.5)", () => {
  const fleetBase = requireEnv("FLEET_MANAGEMENT_BASE_URL");
  const vsBase = requireEnv("VEHICLE_STATE_BASE_URL");

  test("Happy path: vehicle-state has current state for a known vehicle after POST /state (and fleet-management is healthy)", async () => {
    // 1) fleet-management liveness (ensures harness started it and it responds)
    const fmHealth = await httpJson(`${fleetBase}/health`, { method: "GET", timeoutMs: 2000 });
    expect(fmHealth.status).toBe(200);
    expect(fmHealth.body).toMatchObject({ ok: true, service: "fleet-management" });

    // 2) Seed state in vehicle-state (represents the state data FM would consume operationally)
    const vehicleId = "VIN123";
    const update = {
      schemaVersion: "v1",
      vehicleId,
      timestamp: new Date().toISOString(),
      state: {
        speedKph: 42,
        latitude: 37.77,
        longitude: -122.41,
        batteryPct: 88,
      },
    };

    const postRes = await httpJson(`${vsBase}/state`, { method: "POST", body: update, timeoutMs: 3000 });
    expect(postRes.status).toBe(202);
    expect(postRes.body).toMatchObject({ ok: true });

    // 3) Query current and validate normalized response
    const curRes = await httpJson(`${vsBase}/state/${encodeURIComponent(vehicleId)}/current`, {
      method: "GET",
      timeoutMs: 3000,
    });

    expect(curRes.status).toBe(200);
    expect(curRes.body).toHaveProperty("ok", true);
    expect(curRes.body).toHaveProperty("item");
    expect(curRes.body.item).toMatchObject({
      vehicleId,
      state: expect.objectContaining({
        speedKph: 42,
      }),
    });

    // normalized ISO timestamp
    expect(typeof curRes.body.item.timestamp).toBe("string");
    expect(Number.isFinite(new Date(curRes.body.item.timestamp).getTime())).toBe(true);
  });

  test("Error path: invalid request (bad vehicleId) returns 4xx from vehicle-state", async () => {
    const invalid = readJsonFixture("./fixtures/vehicleState.query.invalid.request.json");
    const vehicleId = invalid.vehicleId; // intentionally empty

    // Vehicle-state contract: GET /state/:vehicleId/current returns 400 when vehicleId is empty.
    // Here we approximate a 'bad request' scenario by passing whitespace.
    const res = await httpJson(`${vsBase}/state/${encodeURIComponent(" ")}/current`, { method: "GET", timeoutMs: 3000 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(res.body).toMatchObject({ ok: false, error: expect.any(String) });
  });

  test("Error path: vehicle-state not-found for a vehicle returns 404 (FM should map similarly when it implements the proxy)", async () => {
    const notFoundVehicleId = "VIN_NOT_FOUND_404";

    const res = await httpJson(`${vsBase}/state/${encodeURIComponent(notFoundVehicleId)}/current`, {
      method: "GET",
      timeoutMs: 3000,
    });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ ok: false, error: "not_found" });
  });

  test("Optional auth behavior: no-op unless AUTH_REQUIRED=true", async () => {
    if (String(process.env.AUTH_REQUIRED || "false").toLowerCase() !== "true") {
      // Not asserting anything; suite runs in AUTH_REQUIRED=false harness mode by default.
      return;
    }

    // If someone overrides harness env to AUTH_REQUIRED=true, unauthenticated call should fail.
    const res = await httpJson(`${fleetBase}/orgs`, {
      method: "POST",
      body: { name: "Acme Fleet" },
      timeoutMs: 3000,
    });

    expect([401, 403]).toContain(res.status);
    expect(res.body).toMatchObject({ ok: false, error: expect.any(String) });
  });
});
