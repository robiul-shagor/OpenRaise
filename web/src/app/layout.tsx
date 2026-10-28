import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Merriweather } from "next/font/google";
import { Providers } from "./providers";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { NetworkGuard } from "@/components/NetworkGuard";
import { TxToasts } from "@/components/TxToasts";
import "./globals.css";

const merriweather = Merriweather({ variable: "--font-merriweather", subsets: ["latin"], weight: ["700", "900"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "OpenRaise — crowdfunding dApp demo",
  description: "All-or-nothing EVM crowdfunding technical demo. Local Anvil / testnet only — no real funds.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${merriweather.variable} ${inter.variable} ${jetbrains.variable} h-full antialiased`}>
      {/* Browser extensions (e.g. Grammarly) inject attributes on <body>; ignore those mismatches here only. */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <Providers>
          <div className="bg-forest px-6 py-[7px] text-center text-xs text-mint-2">
            Technical demo on a local test chain — test ETH and a mock token only. Not a fundraising or investment service.
          </div>
          <SiteHeader />
          <NetworkGuard />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <TxToasts />
        </Providers>
      </body>
    </html>
  );
}
