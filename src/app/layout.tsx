import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CARTINT — Automotive Threat Intelligence",
  description: "CARTINT: Automotive threat intelligence dashboard with multi-source dark-web OSINT scraping, AI automotive-relevance classification (zero false positives), and Auto-ISAC ATM matrix mapping.",
  keywords: ["CARTINT", "automotive threat intelligence", "dark web", "OSINT", "Auto-ISAC", "ATM", "connected vehicle", "CTI"],
  authors: [{ name: "CARTINT" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "CARTINT — Automotive Threat Intelligence",
    description: "Dark-web OSINT + AI-classified automotive threat intelligence with Auto-ISAC ATM mapping.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CARTINT — Automotive Threat Intelligence",
    description: "Dark-web OSINT + AI-classified automotive threat intelligence.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
