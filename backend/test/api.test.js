const test = require("node:test");
const assert = require("node:assert/strict");
const app = require("../src/app");
const routes = require("../src/routes");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health endpoint responds without exposing configuration", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("x-powered-by"), null);
});

test("protected account endpoints reject unauthenticated requests", async () => {
  const response = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { message: "Authentication required." });
});

test("admin HR creation route is not shadowed by the organization catalog route", () => {
  const hrCreate = routes.stack.findIndex((layer) => layer.route?.path === "/organization/hr" && layer.route.methods.post);
  const genericCreate = routes.stack.findIndex((layer) => layer.route?.path === "/organization/:type" && layer.route.methods.post);
  assert.notEqual(hrCreate, -1);
  assert.notEqual(genericCreate, -1);
  assert.ok(hrCreate < genericCreate);
});
