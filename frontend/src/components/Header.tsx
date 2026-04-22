"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

export function Header() {
  const pathname = usePathname();
  const isSettlementPage = pathname === "/";

  return (
    <header className="h-[64px] bg-neutral-surface border-b border-neutral-border flex items-center justify-between pl-4 pr-6 flex-shrink-0 z-10 w-full">
      {/* Search Bar */}
      <div className="flex items-center bg-neutral-background rounded-md px-3 py-2 w-96 border border-neutral-border focus-within:border-brand-primary transition-colors group">
        <Search className="w-4 h-4 text-neutral-text-tertiary mr-2 group-focus-within:text-brand-primary transition-colors" />
        <input 
          type="text" 
          placeholder="Search case ref, policy no, or ID..." 
          className="bg-transparent border-none outline-none text-sm w-full text-neutral-text-primary placeholder:text-neutral-text-tertiary"
        />
      </div>

      {/* Ticker Tape (Only visible on settlement page) */}
      {isSettlementPage ? (
        <div className="flex-1 overflow-hidden mx-6 hidden md:flex items-center whitespace-nowrap text-[13px] font-mono tracking-tight">
          <div className="animate-marquee flex space-x-6">
            <span className="text-neutral-text-primary">AVG CYCLE <span className="text-semantic-success ml-1">94s</span></span>
            <span className="text-neutral-text-primary">FRAUD FLAGS <span className="text-semantic-danger ml-1">3 TODAY</span></span>
            <span className="text-neutral-text-primary">PENDING APPROVAL <span className="text-semantic-warning ml-1">12</span></span>
            <span className="text-neutral-text-primary">API STATUS <span className="text-semantic-success ml-1">ONLINE</span></span>
            <span className="text-neutral-text-primary">MERIMEN SYNC <span className="text-semantic-success ml-1">HEALTHY</span></span>
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* User Profile */}
      <div className="flex items-center space-x-2">
        <div className="text-sm font-medium text-neutral-text-secondary">Claims Officer</div>
        <div className="w-8 h-8 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-[10px] font-bold text-brand-primary uppercase">
          CO
        </div>
      </div>
    </header>
  );
}
