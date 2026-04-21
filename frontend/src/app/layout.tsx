import type { Metadata } from "next";
import React from "react";
import { Inter, Roboto } from "next/font/google";
import "./globals.css";
import { Search, Activity, Briefcase, BarChart2, Filter, MessageSquare } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

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
    <html lang="en">
      <body className={`${inter.variable} ${roboto.variable} font-sans antialiased bg-neutral-background text-neutral-text-primary h-screen w-screen overflow-hidden flex`}>
        {/* Navigation Sidebar */}
        <aside className="w-[60px] h-full bg-neutral-surface border-r border-neutral-border flex flex-col items-center py-4 flex-shrink-0 z-20">
          <div className="w-10 h-10 bg-brand-primary rounded-md flex items-center justify-center font-bold text-brand-on-primary mb-8 shadow-sm">
            YT
          </div>
          
          <nav className="flex flex-col w-full items-center space-y-4 flex-1">
            <NavItem icon={<Briefcase />} label="My Queue" active />
            <NavItem icon={<Activity />} label="Live Engine" />
            <NavItem icon={<MessageSquare />} label="Escalations" />
            <NavItem icon={<BarChart2 />} label="Analytics" />
            <NavItem icon={<Filter />} label="Search Cases" />
            
            <div className="flex-1" />
            <ThemeToggle />
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="flex flex-col flex-1 h-full overflow-hidden relative">
          {/* Top Navigation Bar */}
          <header className="h-[64px] bg-neutral-surface border-b border-neutral-border flex items-center justify-between pl-4 pr-6 flex-shrink-0 z-10 w-full">
            {/* Search Bar */}
            <div className="flex items-center bg-neutral-background rounded-md px-3 py-2 w-96 border border-neutral-border focus-within:border-brand-primary transition-colors">
              <Search className="w-4 h-4 text-neutral-text-tertiary mr-2" />
              <input 
                type="text" 
                placeholder="Search case ref, policy no, or ID..." 
                className="bg-transparent border-none outline-none text-sm w-full text-neutral-text-primary placeholder:text-neutral-text-tertiary"
              />
            </div>

            {/* Ticker Tape (Adapted for Insurance) */}
            <div className="flex-1 overflow-hidden mx-6 hidden md:flex items-center whitespace-nowrap text-[13px] font-mono tracking-tight">
              <div className="animate-marquee flex space-x-6">
                <span className="text-neutral-text-primary">AVG CYCLE <span className="text-semantic-success ml-1">94s</span></span>
                <span className="text-neutral-text-primary">FRAUD FLAGS <span className="text-semantic-danger ml-1">3 TODAY</span></span>
                <span className="text-neutral-text-primary">PENDING APPROVAL <span className="text-semantic-warning ml-1">12</span></span>
                <span className="text-neutral-text-primary">API STATUS <span className="text-semantic-success ml-1">ONLINE</span></span>
                <span className="text-neutral-text-primary">MERIMEN SYNC <span className="text-semantic-success ml-1">HEALTHY</span></span>
              </div>
            </div>

            {/* User Profile */}
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-neutral-background rounded-full border border-neutral-border"></div>
              <div className="text-sm font-medium">Claims Officer</div>
            </div>
          </header>

          {/* Page Content */}
          <main className="flex-1 overflow-hidden h-[calc(100vh-64px)] w-full">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <div className={`w-full flex justify-center group relative cursor-pointer py-3 ${active ? 'border-l-3 border-brand-primary' : 'border-l-3 border-transparent'}`}>
      <div className={`${active ? 'text-brand-primary' : 'text-neutral-text-secondary group-hover:text-neutral-text-primary'} transition-colors`}>
        {React.cloneElement(icon as React.ReactElement<any>, { className: "w-6 h-6" })}
      </div>
      <div className="absolute left-full ml-2 px-2 py-1 bg-neutral-surface text-neutral-text-primary text-xs rounded shadow-card pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 border border-neutral-border whitespace-nowrap">
        {label}
      </div>
    </div>
  )
}
