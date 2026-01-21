"use strict";

const fs = require("fs");
const path = require("path");

/**
 * @typedef {"admin"|"operator"} Role
 */

/**
 * @typedef {Object} Organization
 * @property {string} id
 * @property {string} name
 * @property {number} createdAt
 */

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} orgId
 * @property {string} name
 * @property {Role} role
 * @property {number} createdAt
 */

/**
 * @typedef {Object} Vehicle
 * @property {string} id
 * @property {string} orgId
 * @property {string} vin
 * @property {string=} name
 * @property {number} createdAt
 */

/**
 * @typedef {Object} Assignment
 * @property {string} id
 * @property {string} orgId
 * @property {string} userId
 * @property {string} vehicleId
 * @property {number} createdAt
 */

/**
 * @typedef {Object} StoreState
 * @property {Record<string, Organization>} orgs
 * @property {Record<string, User>} users
 * @property {Record<string, Vehicle>} vehicles
 * @property {Record<string, Assignment>} assignments
 */

function nowMs() {
  return Date.now();
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * PUBLIC_INTERFACE
 * Create a dev-friendly store with either in-memory or file-backed persistence.
 *
 * Notes:
 * - This is intentionally minimal for MVP; do not use in production.
 *
 * @param {{ mode: "memory"|"file", filePath: string, logger?: {info: Function, warn: Function, error: Function} }} options
 */
function createStore(options) {
  const mode = options?.mode || "memory";
  const filePath = options?.filePath;

  /** @type {StoreState} */
  let state = { orgs: {}, users: {}, vehicles: {}, assignments: {} };

  function loadFromDisk() {
    if (mode !== "file") return;
    if (!filePath) throw new Error("STORE_FILE_PATH is required when STORE_MODE=file");
    try {
      if (!fs.existsSync(filePath)) {
        ensureDirForFile(filePath);
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
        return;
      }
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw || "{}");
      state = {
        orgs: parsed.orgs || {},
        users: parsed.users || {},
        vehicles: parsed.vehicles || {},
        assignments: parsed.assignments || {},
      };
    } catch (e) {
      options?.logger?.warn?.("Failed to load store from disk; starting fresh", { error: String(e?.message || e) });
    }
  }

  function persistToDisk() {
    if (mode !== "file") return;
    if (!filePath) throw new Error("STORE_FILE_PATH is required when STORE_MODE=file");
    try {
      ensureDirForFile(filePath);
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
    } catch (e) {
      options?.logger?.error?.("Failed to persist store to disk", { error: String(e?.message || e) });
    }
  }

  loadFromDisk();

  function createOrg({ name }) {
    const id = makeId("org");
    const org = { id, name, createdAt: nowMs() };
    state.orgs[id] = org;
    persistToDisk();
    return org;
  }

  function createUser({ orgId, name, role }) {
    const id = makeId("usr");
    const user = { id, orgId, name, role, createdAt: nowMs() };
    state.users[id] = user;
    persistToDisk();
    return user;
  }

  function createVehicle({ orgId, vin, name }) {
    const id = makeId("veh");
    const vehicle = { id, orgId, vin, name, createdAt: nowMs() };
    state.vehicles[id] = vehicle;
    persistToDisk();
    return vehicle;
  }

  function createAssignment({ orgId, userId, vehicleId }) {
    const id = makeId("asgn");
    const assignment = { id, orgId, userId, vehicleId, createdAt: nowMs() };
    state.assignments[id] = assignment;
    persistToDisk();
    return assignment;
  }

  function deleteAssignment(id) {
    const existing = state.assignments[id];
    if (!existing) return undefined;
    delete state.assignments[id];
    persistToDisk();
    return existing;
  }

  function getOrg(id) {
    return state.orgs[id];
  }

  function getUser(id) {
    return state.users[id];
  }

  function getVehicle(id) {
    return state.vehicles[id];
  }

  function listOrgVehicles(orgId) {
    return Object.values(state.vehicles).filter((v) => v.orgId === orgId);
  }

  function listUserVehicles(userId) {
    const user = getUser(userId);
    if (!user) return [];
    const userAssignments = Object.values(state.assignments).filter((a) => a.userId === userId);
    const vehicleIds = new Set(userAssignments.map((a) => a.vehicleId));
    return Object.values(state.vehicles).filter((v) => v.orgId === user.orgId && vehicleIds.has(v.id));
  }

  function findAssignmentByUserVehicle(orgId, userId, vehicleId) {
    return Object.values(state.assignments).find(
      (a) => a.orgId === orgId && a.userId === userId && a.vehicleId === vehicleId
    );
  }

  return {
    mode,
    createOrg,
    createUser,
    createVehicle,
    createAssignment,
    deleteAssignment,
    getOrg,
    getUser,
    getVehicle,
    listOrgVehicles,
    listUserVehicles,
    findAssignmentByUserVehicle,
  };
}

module.exports = { createStore };
