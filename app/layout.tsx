import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
});

export const metadata: Metadata = {
  title: "Perfect Stop — Reflex Arcade Game",
  description:
    "Stop the bouncing indicator inside the zone. One wrong move and the run is over. How high can you go?",
};

export const viewport: Viewport = {
  themeColor: "#ece6ff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="playful"
      className={`${fredoka.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        {children}
        {/* Platform ad SDKs (Poki, CrazyGames, …) are loaded dynamically by
            lib/platform so only the detected hosting platform's SDK is
            fetched and initialized — never more than one per session. The
            game degrades gracefully when a script is absent (local dev,
            offline, unsupported portal). */}
      </body>
    </html>
  );
}
