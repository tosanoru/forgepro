import type { Metadata } from "next";
import { Inter, Syne, DM_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { AuthSessionProvider } from "@/components/AuthSessionProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Swapped from Forge's Space Grotesk to Syne — matches the established
// dark industrial-luxury display type pairing used across the other
// projects (Keystone, Pulse, OmniStudio).
const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

// Swapped from Forge's JetBrains Mono to DM Mono for the same reason.
const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Dashboard — Forge 2",
  description: "Content planning, video review, AI scripting, and client approval in one workspace.",
};

export const viewport = {
  themeColor: "#0A0B0F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${inter.variable} ${syne.variable} ${dmMono.variable} antialiased`} suppressHydrationWarning>
        <AuthSessionProvider>
          {children}
          <Toaster />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
