import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";
import "./globals.css";

/**
 * Root layout — the document shell for every route.
 *
 * Fonts are self-hosted by `next/font` at build time (no runtime CDN request),
 * so `Cross-Origin-Embedder-Policy: require-corp` stays satisfiable (APP-03).
 *
 * The per-request CSP nonce and the CSRF token are produced in `proxy.ts` on the
 * Edge before this renders: the nonce is applied to Next's own scripts via the
 * CSP header, and the CSRF token is seeded as the `csrf_token` cookie and
 * forwarded as the `x-csrf-token` request header for forms to embed (SEC-21).
 */

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
