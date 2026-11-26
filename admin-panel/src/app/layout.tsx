import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import { readSessionUser } from "@/lib/session";
import { SessionProvider } from "@/components/app/SessionProvider";
import { NumberInputGuard } from "@/components/app/NumberInputGuard";
import "./globals.css";

const montserrat = Montserrat({
  // Variable font: one file covers every weight used (300-900) instead of six downloads
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "VaidyaCure | Admin & Operations Dashboard",
  description: "High-performance admin portal for managing medicines, orders, doctors, and healthcare operations.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login cookies, read on the server: menus render for the right role from the first paint
  const sessionUser = await readSessionUser();
  return (
    <html
      lang="en"
      className={`${montserrat.variable} h-full antialiased font-sans`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <SessionProvider user={sessionUser}>
          <NumberInputGuard />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
