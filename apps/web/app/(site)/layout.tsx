import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./motion.css";
import "./motion-components.css";
import "./theme.css";
import "./interior.css";
import "./refinement.css";
import "./rarebird-brand.css";
import "./site-chrome.css";
import SoftAurora from "@/components/soft-aurora";
import ScrollReveal from "@/components/scroll-reveal";
import SmoothScroll from "@/components/smooth-scroll";
import MotionEnhance from "@/components/motion";
import Noise from "@/components/motion/noise";
import GridField from "@/components/site/grid-field";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.rarebird.network"),
  title: "Rarebird — Stock opportunity screener for AI agents",
  description:
    "Screen developing US-stock setups with relative-strength checks, source context and lifecycle updates for your AI agent.",
  openGraph: {
    type: "website",
    url: "https://www.rarebird.network",
    siteName: "Rarebird",
    title: "Rarebird — Stock opportunity screener for AI agents",
    description:
      "Developing stock setups, agent alerts and measured follow-through. Starting with NVDA, AAPL, MSFT and GOOGL.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Rarebird — Stock opportunity screener for AI agents",
    description:
      "Give your agent the stock setup, the evidence and an update when conditions change.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Runs during parse, before React. Without it the page paints dark and then flips,
 * which is worse than not offering a choice.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("rarebird-theme");document.documentElement.dataset.theme=t==="light"?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="antialiased">
        <GridField />
        <div className="aurora-layer" aria-hidden="true">
          {/* Neutral: the aurora reads as soft light, not colour. */}
          <SoftAurora color1="#ffffff" color2="#6f6f6f" brightness={0.85} />
        </div>
        <Noise />
        <ScrollReveal />
        <SmoothScroll />
        <MotionEnhance />
        {children}
        {/* Page views. Mounted at the root so every route is counted, including
            the docs and the dashboard. */}
        <Analytics />
      </body>
    </html>
  );
}

