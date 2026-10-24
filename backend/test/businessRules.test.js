const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateTax, calculateLatePenalty } = require("../src/services/payrollService");
const { localDateKey, localMinutes, parseOfficeDateTime } = require("../src/services/timeService");
const { countWorkingDaysInRange } = require("../src/services/leaveService");
const { distanceMeters } = require("../src/services/geofenceService");
const { validateCheckInPolicy } = require("../src/services/attendancePolicyService");
const { isSalaryQuestion, isRomanUrdu } = require("../src/controllers/aiController");

test("calculates monthly tax progressively at each annual slab", () => {
  assert.equal(calculateTax(600000), 0);
  assert.equal(calculateTax(900000), 1250);
  assert.equal(calculateTax(1200000), 2500);
  assert.equal(calculateTax(2400000), 17500);
  assert.equal(calculateTax(3600000), 42500);
  assert.equal(calculateTax(4200000), 60000);
});

test("uses the configured office timezone to determine attendance day and time", () => {
  const timestamp = new Date("2026-10-24T19:30:00.000Z");
  assert.equal(localDateKey(timestamp, "Asia/Karachi"), "2026-10-25");
  assert.equal(localMinutes(timestamp, "Asia/Karachi"), 30);
  assert.equal(localDateKey(timestamp, "UTC"), "2026-10-24");
  assert.equal(parseOfficeDateTime("2026-10-25T09:00", "Asia/Karachi").toISOString(), "2026-10-25T04:00:00.000Z");
  assert.throws(() => parseOfficeDateTime("2026-03-08T02:30", "America/New_York"), /invalid for the configured office timezone/);
});

test("detects compensation questions before an employee AI request reaches Groq", () => {
  assert.equal(isSalaryQuestion("What is Ali's salary?"), true);
  assert.equal(isSalaryQuestion("How much does another employee earn?"), true);
  assert.equal(isSalaryQuestion("Ali ki tankhwa kitni hai?"), true);
  assert.equal(isSalaryQuestion("How many annual leave days do I have?"), false);
});

test("recognizes Roman Urdu prompts and computes a safe office geofence distance", () => {
  assert.equal(isRomanUrdu("Mujhe aglay haftay chhutti chahiye"), true);
  assert.equal(distanceMeters(24.8607, 67.0011, 24.8607, 67.0011), 0);
  assert.ok(distanceMeters(0, 0, 0, 1) > 111000 && distanceMeters(0, 0, 0, 1) < 112000);
});

test("enforces optional location and camera attendance policies", () => {
  const company = {
    geofenceEnabled: true,
    officeLatitude: 24.8607,
    officeLongitude: 67.0011,
    attendanceRadiusMeters: 100,
    cameraCheckEnabled: true
  };
  assert.equal(validateCheckInPolicy(company, {}).status, 400);
  assert.equal(validateCheckInPolicy(company, { latitude: 24.9, longitude: 67.1, cameraPresenceChecked: true }).status, 403);
  assert.equal(validateCheckInPolicy(company, { latitude: 24.8607, longitude: 67.0011 }).status, 400);
  assert.equal(validateCheckInPolicy(company, { latitude: 24.8607, longitude: 67.0011, cameraPresenceChecked: true }), null);
  assert.equal(validateCheckInPolicy({ geofenceEnabled: false, cameraCheckEnabled: false }, {}), null);
});

test("keeps late penalties opt-in and caps deductions at monthly gross", () => {
  assert.equal(calculateLatePenalty(1000, 5, 0, 30000), 0);
  assert.equal(calculateLatePenalty(1000, 2, 5, 30000), 100);
  assert.equal(calculateLatePenalty(1000, 100, 100, 30000), 30000);
});

test("leave working-day calculation excludes configured weekends and holidays", () => {
  const start = new Date("2026-10-24T00:00:00.000Z");
  const end = new Date("2026-10-28T00:00:00.000Z");
  assert.equal(countWorkingDaysInRange(start, end, [0, 6], new Set(["2026-10-26"])), 2);
});
