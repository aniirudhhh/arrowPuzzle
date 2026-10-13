export default function robots() {
  const preview = ["deploy-preview", "branch-deploy"].includes(
    process.env.CONTEXT,
  );
  return {
    rules: {
      userAgent: "*",
      allow: preview ? undefined : "/",
      disallow: preview ? "/" : "/api/",
    },
    sitemap: "https://arrowout.xyz/sitemap.xml",
  };
}
