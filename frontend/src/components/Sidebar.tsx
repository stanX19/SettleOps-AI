"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Briefcase, BarChart2, MessageSquare, Bell } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { useCaseStore } from "@/stores/case-store";

const LOGO_SRC = "/Logo__2_-removebg-preview.png";

export function Sidebar() {
  const pathname = usePathname();

  const caseId = useCaseStore(state => state.case_id);

  return (
    <aside className="w-[60px] h-full bg-neutral-surface border-r border-neutral-border flex flex-col items-center py-4 flex-shrink-0 z-20">
      <Link href="/dashboard">
        <div className="w-10 h-10 rounded-md flex items-center justify-center mb-8 shadow-sm cursor-pointer overflow-hidden bg-neutral-background border border-neutral-border">
          <img src={LOGO_SRC} alt="SettleOps AI" className="h-full w-full object-cover" />
        </div>
      </Link>

      <nav className="flex flex-col w-full items-center space-y-4 flex-1">
        <NavItem
          icon={<MessageSquare />}
          label="Start a new workflow"
          href="/chat"
          active={pathname === "/chat"}
        />
        <NavItem
          icon={<Briefcase />}
          label="Dashboard"
          href="/dashboard"
          active={pathname === "/dashboard"}
        />
        <NavItem
          icon={<Activity />}
          label="Live workflow"
          href={caseId ? `/workflow/${caseId}` : "/workflow/CLM-2026-00001"}
          active={pathname.startsWith("/workflow")}
        />
        <NavItem
          icon={<Bell />}
          label="Notifications"
          href="/notification"
          active={pathname === "/notification"}
        />
        <NavItem
          icon={<BarChart2 />}
          label="Analytics"
          href="/analytics"
          active={pathname === "/analytics"}
        />

        <div className="flex-1" />
        <ThemeToggle />
      </nav>
    </aside>
  );
}

function NavItem({
  icon,
  label,
  href,
  active = false
}: {
  icon: React.ReactElement<{ className?: string }>,
  label: string,
  href: string,
  active?: boolean
}) {
  return (
    <Link href={href} className="w-full">
      <div className={`w-full flex justify-center group relative cursor-pointer py-3 transition-all duration-200 ${active ? 'border-l-3 border-brand-primary bg-brand-primary/5' : 'border-l-3 border-transparent'}`}>
        <div className={`${active ? 'text-brand-primary' : 'text-neutral-text-secondary group-hover:text-neutral-text-primary'} transition-colors`}>
          {React.cloneElement(icon, { className: "w-6 h-6" })}
        </div>

        {/* Tooltip */}
        <div className="absolute left-full ml-2 px-2 py-1 bg-neutral-surface text-neutral-text-primary text-xs rounded shadow-card pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 border border-neutral-border whitespace-nowrap">
          {label}
        </div>
      </div>
    </Link>
  );
}
