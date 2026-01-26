"use strict";

const validTelematics = require("./fixtures/telematics.valid.json");
const { httpJson } = require("./helpers/httpClient");

/**
 * Derive a StateUpdateV1 from a TelematicsV1-like payload.
 * This mirrors the existing SWE.5 approach: normalization + mapping is not yet a runtime publish.
 */
function toStateUpdateV1(telematics) {
  return {
    schemaVersion: "v1",
    vehicleId: telematics.vehicleId,
    timestamp: new Date(telematics.timestamp).toISOString(),
    state: {
      speedKph: telematics.speedKph,
      batteryPct: telematics.batteryPct,
      fuelPct: telematics.fuelPct,
      latitude: telematics.latitude,
      longitude: telematics.longitude,
    },
  };
}

function baseUrls() {
  return {
    ingestion: process.env.TELEMATICS_INGESTION_BASE_URL,
    vehicleState: process.env.VEHICLE_STATE_BASE_URL,
    fleet: process.env.FLEET_MANAGEMENT_BASE_URL,
  };
}

describe("SWE.6 E2E: telemetry update -> vehicle-state query (telematics-ingestion -> vehicle-state -> fleet readiness)", () => {
  test("Scenario 1: batch ingest accepts telemetry; derived state update can be queried back", async () => {
    const { ingestion, vehicleState, fleet } = baseUrls();
    expect(ingestion).toBeTruthy();
    expect(vehicleState).toBeTruthy();
    expect(fleet).toBeTruthy();

    // fleet-management readiness (represents platform operational consumer being up)
    const fmHealth = await httpJson(`${fleet}/health`, { method: "GET", timeoutMs: 3000 });
    expect(fmHealth.status).toBe(200);
    expect(fmHealth.body?.ok).toBe(true);

    // telematics-ingestion accepts batch payload (external deps disabled)
    const ingestRes = await httpJson(`${ingestion}/v1/telematics/batch`, {
      method: "POST",
      body: { items: [validTelematics] },
      timeoutMs: 5000,
    });

    expect(ingestRes.status).toBe(200);
    expect(ingestRes.body?.ok).toBe(true);
    expect(Array.isArray(ingestRes.body?.results)).toBe(true);

    // derived state update posted to vehicle-state (qualifies state update + query)
    const stateUpdate = toStateUpdateV1(validTelematics);
    const postRes = await httpJson(`${vehicleState}/state`, { method: "POST", body: stateUpdate, timeoutMs: 5000 });
    expect(postRes.status).toBe(202);
    expect(postRes.body?.ok).toBe(true);

    const curRes = await httpJson(`${vehicleState}/state/${encodeURIComponent(stateUpdate.vehicleId)}/current`, {
      method: "GET",
      timeoutMs: 5000,
    });

    expect(curRes.status).toBe(200);
    expect(curRes.body?.ok).toBe(true);
    expect(curRes.body?.item?.vehicleId).toBe(stateUpdate.vehicleId);
    expect(curRes.body?.item?.state?.speedKph).toBe(validTelematics.speedKph);
    expect(curRes.body?.item?.state?.latitude).toBe(validTelematics.latitude);
    expect(curRes.body?.item?.state?.longitude).toBe(validTelematics.longitude);
  });
});
