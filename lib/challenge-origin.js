export function validChallengeOrigin(request, env = process.env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = [new URL(request.url).origin];
  if (env.NETLIFY) {
    allowed.push("https://arrowout.xyz", "https://www.arrowout.xyz");
    for (const value of [env.URL, env.DEPLOY_URL, env.DEPLOY_PRIME_URL]) {
      if (!value) continue;
      try {
        allowed.push(new URL(value).origin);
      } catch {}
    }
  }
  return allowed.includes(origin);
}
