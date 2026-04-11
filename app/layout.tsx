import type { Metadata, Viewport } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import QueryProvider from "@/components/QueryProvider";
import ConsentModal from "@/components/ui/ConsentModal";
import DraftBar from "@/components/ui/DraftBar";

export const metadata: Metadata = {
  title: "TechnicalAI — AI-Powered Technical Analysis",
  description:
    "Enter any stock or crypto ticker and get instant AI-powered technical analysis: pattern detection, support & resistance levels, and chart overlays — powered by Gemini.",
  keywords: [
    "technical analysis",
    "AI trading",
    "stock chart patterns",
    "support resistance",
    "head and shoulders",
    "candlestick patterns",
    "gemini AI",
    "trading tools",
  ],
  authors: [{ name: "TechnicalAI" }],
  openGraph: {
    title: "TechnicalAI — AI-Powered Technical Analysis",
    description:
      "AI-powered chart pattern detection for stocks and crypto. Real-time technical analysis with visual overlays.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#080810",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-noise bg-grid antialiased">
        {/* Mobile not-supported overlay — hidden on md+ */}
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-background px-8 text-center md:hidden">
          <div className="text-4xl">📊</div>
          <div>
            <p className="text-lg font-bold text-foreground mb-2">Desktop only for now</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              TechnicalAI is optimized for desktop screens.<br />
              Please open it on a laptop or desktop to get the full experience.
            </p>
          </div>
        </div>

        <SessionProvider>
          <QueryProvider>
            {children}
            <ConsentModal />
            <DraftBar />
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
