export default function sitemap() {
  return [
    { url: "https://arrowout.xyz/", changeFrequency: "weekly", priority: 1 },
    {
      url: "https://arrowout.xyz/how-to-play",
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
