import "./globals.css";
import { Google_Sans_Flex, Roboto_Flex } from "next/font/google";
const displayFont = Google_Sans_Flex({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
  variable: "--font-google-sans-flex",
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: false,
});
const bodyFont = Roboto_Flex({
  subsets: ["latin"],
  weight: "variable",
  axes: ["opsz"],
  display: "swap",
  variable: "--font-roboto-flex",
});
const siteUrl = "https://arrowout.xyz";
const description =
  "Play ArrowOut, a free online arrow puzzle game. Clear tangled paths, explore endless levels, solve daily and timed challenges, or race a friend.";
export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "ArrowOut - Free Online Arrow Puzzle Game",
    template: "%s | ArrowOut",
  },
  description,
  applicationName: "ArrowOut",
  alternates: { canonical: "/" },
  robots: {
    index:
      process.env.CONTEXT !== "deploy-preview" &&
      process.env.CONTEXT !== "branch-deploy",
    follow: true,
  },
  openGraph: {
    title: "ArrowOut - Free Online Arrow Puzzle Game",
    description,
    url: siteUrl,
    siteName: "ArrowOut",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "ArrowOut - Think. Tap. Escape.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "ArrowOut - Free Online Arrow Puzzle Game",
    description,
    images: ["/opengraph-image"],
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
};
export default function Layout({ children }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${bodyFont.variable}`}>
      <body>{children}</body>
    </html>
  );
}
