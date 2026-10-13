export function validChallengeOrigin(request, env = process.env) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = [
    new URL(request.url).origin,
    "https://arrowout.xyz",
    "https://www.arrowout.xyz",
  ];
  for (const value of [env.URL, env.DEPLOY_URL, env.DEPLOY_PRIME_URL]) {
    if (!value) continue;
    try {
      allowed.push(new URL(value).origin);
    } catch {}
  }
  return allowed.includes(origin);
}
export function secureChallengeCookie(request, env = process.env) {
  return (
    env.NODE_ENV === "production" ||
    new URL(request.url).protocol === "https:" ||
    request.headers.get("origin")?.startsWith("https://")
  );
}
