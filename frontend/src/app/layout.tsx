import type { Metadata } from "next";
import React from "react";
import { Inter, Roboto } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Header } from "@/components/Header";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const roboto = Roboto({
  variable: "--font-roboto",
  weight: ["400", "500", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Claims Engine",
  description: "Next-gen claims engine operating system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.variable} ${roboto.variable} font-sans antialiased bg-neutral-background text-neutral-text-primary h-screen w-screen overflow-hidden flex`}>
        {/* Navigation Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex flex-col flex-1 h-full overflow-hidden relative">
          {/* Top Navigation Bar */}
          <Header />

          {/* Page Content */}
          <main className="flex-1 overflow-hidden h-[calc(100vh-64px)] w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
