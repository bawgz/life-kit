import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { API_TOKEN, PASSWORD, app, closeApp } from "./helpers.js";

after(closeApp);

function sessionCookie(setCookie: string | string[] | undefined): string {
  const header = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  assert.ok(header, "expected a set-cookie header");
  return header.split(";")[0];
}

describe("auth", () => {
  it("serves health without auth", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(res.statusCode, 200);
  });

  it("rejects requests with no credentials", async () => {
    const res = await app.inject({ method: "GET", url: "/api/plans" });
    assert.equal(res.statusCode, 401);
  });

  it("rejects a wrong bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/plans",
      headers: { authorization: "Bearer nope" },
    });
    assert.equal(res.statusCode, 401);
  });

  it("accepts the API bearer token", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/plans",
      headers: { authorization: `Bearer ${API_TOKEN}` },
    });
    assert.equal(res.statusCode, 200);
  });

  it("rejects a wrong password", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: "wrong" },
    });
    assert.equal(res.statusCode, 401);
  });

  it("logs in with a cookie session, then logs out", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { password: PASSWORD },
    });
    assert.equal(login.statusCode, 200);
    const cookie = sessionCookie(login.headers["set-cookie"]);

    const me = await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } });
    assert.equal(me.statusCode, 200);
    const plans = await app.inject({ method: "GET", url: "/api/plans", headers: { cookie } });
    assert.equal(plans.statusCode, 200);

    const logout = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie } });
    assert.equal(logout.statusCode, 200);

    const after = await app.inject({ method: "GET", url: "/api/plans", headers: { cookie } });
    assert.equal(after.statusCode, 401);
  });

  it("/api/auth/me is 401 without a session", async () => {
    const res = await app.inject({ method: "GET", url: "/api/auth/me" });
    assert.equal(res.statusCode, 401);
  });
});
