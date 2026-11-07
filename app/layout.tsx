import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import Script from "next/script";
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
        {/* Official Poki HTML5 SDK — required for rewardedBreak() and the
            Poki Inspector event log. Loaded before hydration; the game
            degrades gracefully when it is absent (local dev, offline). */}
        <Script
          src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"
          strategy="beforeInteractive"
        />
      </body>
    </html>
  );
}
