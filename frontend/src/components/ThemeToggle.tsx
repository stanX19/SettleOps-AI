"use client";

import React, { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Check initial
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    } else if (savedTheme === "light") {
      document.documentElement.classList.remove("dark");
      setIsDark(false);
    } else if (document.documentElement.classList.contains("dark")) {
      setIsDark(true);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  return (
    <div 
      onClick={toggleTheme}
      className="w-full flex justify-center group relative cursor-pointer py-3 border-l-3 border-transparent mt-auto"
    >
      <div className="text-neutral-text-secondary group-hover:text-brand-primary transition-colors">
        {isDark ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </div>
      <div className="absolute left-full ml-2 px-2 py-1 bg-neutral-surface text-neutral-text-primary text-xs rounded shadow-card pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 border border-neutral-border whitespace-nowrap">
        {isDark ? "Light Mode" : "Dark Mode"}
      </div>
    </div>
  );
}
