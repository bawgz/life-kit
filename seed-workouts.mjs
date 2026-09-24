#!/usr/bin/env node
// Seeds the local life-kit backend with the three workout templates from the
// old Workout Log Form app (most recent logged sessions, Sep 18-22, 2026).
// Idempotent: skips any plan whose name already exists.
//
// Usage (backend must be running):
//   node seed-workouts.mjs
// Reads API_TOKEN from apps/backend/.env (or $API_TOKEN / $PORT).
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ?? "3001";
const BASE = `http://localhost:${PORT}`;

function loadEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

let apiToken = process.env.API_TOKEN;
for (const p of ["apps/backend/.env", "apps/backend/.env.local", ".env"]) {
  if (!apiToken) apiToken = loadEnvFile(join(ROOT, p)).API_TOKEN;
}
if (!apiToken) {
  console.error("Could not find API_TOKEN (checked $API_TOKEN, apps/backend/.env).");
  process.exit(1);
}

const headers = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiToken}`,
};

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    console.error(`Cannot reach backend at ${BASE} — start it first (npm run dev).`);
    process.exit(1);
  }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

// set helpers: s(weight, reps) / bw(reps) / timed(seconds)
const s = (weight, reps) => ({ targetWeight: weight, targetReps: reps });
const bw = (reps) => ({ targetWeight: null, targetReps: reps });
const timed = (seconds) => ({
  targetWeight: null,
  targetReps: null,
  targetDurationSeconds: seconds,
});
const item = (name, sets, notes = null) => ({
  name,
  orderIndex: 0, // fixed below
  notes,
  sets: sets.map((set, i) => ({ setNumber: i + 1, ...set })),
});
const withOrder = (items) => items.map((it, i) => ({ ...it, orderIndex: i }));

const PLANS = [
  {
    name: "Leg Day",
    kind: "legs",
    description: "Knee-friendly leg day template from the old Workout Log Form.",
    items: withOrder([
      item("Spanish squat holds", [timed(45), timed(45), timed(45), timed(45), timed(45)]),
      item("Box squat", [s(35, 10), s(40, 10), s(40, 10)]),
      item("Decline eccentric squats", [bw(10), bw(10), bw(10)]),
      item("Dumbbell RDL", [s(40, 12), s(40, 10), s(40, 10)]),
      item("Glute bridge", [s(25, 15), s(25, 15), s(25, 15)]),
      item("Calf raises", [bw(15), bw(20), bw(30)]),
      item("Banded lateral walks", [bw(15), bw(15)], "Heavy band"),
    ]),
  },
  {
    name: "Upper A",
    kind: "upper-a",
    description: "Upper A template from the old Workout Log Form.",
    items: withOrder([
      item("Dumbbell bench press", [s(65, 10), s(65, 9), s(65, 7)]),
      item("One-arm dumbbell row", [s(60, 12), s(60, 12), s(60, 12)]),
      item("Seated dumbbell overhead press", [s(35, 10), s(40, 10), s(40, 9)]),
      item("Pull-ups", [bw(7), bw(5), bw(3)]),
      item("Face pulls", [s(37.5, 15), s(37.5, 15)]),
      item("Dumbbell curls", [s(30, 12), s(30, 10)]),
      item("Triceps pushdowns", [s(37.5, 12), s(45, 12)]),
      item("Dead bugs", [bw(12), bw(12), bw(15)]),
    ]),
  },
  {
    name: "Upper B",
    kind: "upper-b",
    description: "Upper B template from the old Workout Log Form.",
    items: withOrder([
      item("Incline dumbbell press", [s(50, 10), s(50, 10), s(50, 10)]),
      item("Chest-supported row", [s(50, 10), s(40, 10), s(40, 12)]),
      item("Seated dumbbell overhead press", [s(40, 10), s(40, 10)]),
      item("Hammer curls", [s(30, 11), s(30, 12)]),
      item("Overhead triceps extension", [s(100, 10), s(100, 10)]),
    ]),
  },
];

const existing = await api("GET", "/api/plans");
const names = new Set(existing.map((p) => p.name.toLowerCase()));
let created = 0;
for (const plan of PLANS) {
  if (names.has(plan.name.toLowerCase())) {
    console.log(`skip: "${plan.name}" already exists`);
    continue;
  }
  const res = await api("POST", "/api/plans", plan);
  const setCount = res.items.reduce((n, it) => n + it.sets.length, 0);
  console.log(`created: "${res.name}" (id ${res.id}, ${res.items.length} exercises, ${setCount} sets)`);
  created++;
}
console.log(created ? `Done — ${created} plan(s) seeded.` : "Nothing to seed — all plans already exist.");
