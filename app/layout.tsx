import type { Metadata, Viewport } from "next";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";
import QueryProvider from "@/components/QueryProvider";
import ConsentModal from "@/components/ui/ConsentModal";

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
        <SessionProvider>
          <QueryProvider>
            {children}
            <ConsentModal />
          </QueryProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
