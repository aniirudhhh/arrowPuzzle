import "./globals.css";
export const metadata = {
  title: "ARROW//OUT — Find your way out",
  description: "A moment of focus. A satisfying arrow escape puzzle.",
};
export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
