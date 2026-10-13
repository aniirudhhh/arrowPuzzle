import test from "node:test";
import assert from "node:assert/strict";
import { validChallengeOrigin } from "./challenge-origin.js";
test("ranked requests accept deployed site origins behind Netlify and reject other sites", () => {
  const request = (origin, url = "http://internal/api/challenge") =>
    new Request(url, { headers: { origin } });
  const env = { NETLIFY: "true", URL: "https://example.netlify.app" };
  assert.equal(
    validChallengeOrigin(request("https://arrowout.xyz"), env),
    true,
  );
  assert.equal(
    validChallengeOrigin(request("https://www.arrowout.xyz"), env),
    true,
  );
  assert.equal(
    validChallengeOrigin(request("https://example.netlify.app"), env),
    true,
  );
  assert.equal(
    validChallengeOrigin(request("https://arrowout.xyz.attacker.com"), env),
    false,
  );
  assert.equal(
    validChallengeOrigin(request("https://attacker.com"), env),
    false,
  );
  assert.equal(
    validChallengeOrigin(
      request("http://127.0.0.1:5173", "http://127.0.0.1:5173/api/challenge"),
      {},
    ),
    true,
  );
  assert.equal(
    validChallengeOrigin(request("https://arrowout.xyz"), {}),
    false,
  );
});
