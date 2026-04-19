import { Link } from "react-router-dom";
import { Rocket, Zap, Shield, FileCode2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Landing() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
      <div className="max-w-3xl space-y-8">
        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-7xl">
          Build Faster with <span className="text-primary-600">Skeleton</span>
        </h1>
        <p className="text-xl text-slate-600">
          The ultimate ultra-lightweight React + FastAPI hackathon template. Get to minimum viable product in minutes, not hours.
        </p>
        
        <div className="flex justify-center gap-4 pt-4">
          <Link
            to="/login"
            className="px-8 py-3 text-lg font-semibold text-white transition-colors rounded-lg bg-primary-600 hover:bg-primary-700"
          >
            Get Started
          </Link>
          <a
            href={`${API_URL}/docs`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center px-8 py-3 text-lg font-semibold transition-colors bg-white border rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            <FileCode2 className="w-5 h-5 mr-2" />
            API Docs
          </a>
          <a
            href="https://github.com/stanX19/HackathonTemplate"
            target="_blank"
            rel="noreferrer"
            className="px-8 py-3 text-lg font-semibold transition-colors bg-white border rounded-lg border-slate-200 text-slate-700 hover:bg-slate-50"
          >
            View on GitHub
          </a>
        </div>

        <div className="grid grid-cols-1 gap-8 pt-16 md:grid-cols-3">
          <div className="flex flex-col items-center p-6 space-y-4 bg-white border rounded-2xl border-slate-100 shadow-sm">
            <div className="p-3 rounded-full bg-blue-50 text-primary-600">
              <Zap size={24} />
            </div>
            <h3 className="text-xl font-bold">Blazing Fast</h3>
            <p className="text-slate-500">Vite frontend and FastAPI backend designed for immediate iteration speed.</p>
          </div>
          
          <div className="flex flex-col items-center p-6 space-y-4 bg-white border rounded-2xl border-slate-100 shadow-sm">
            <div className="p-3 rounded-full bg-blue-50 text-primary-600">
              <Shield size={24} />
            </div>
            <h3 className="text-xl font-bold">Secure Auth</h3>
            <p className="text-slate-500">Built-in JWT authentication with protected routes out of the box.</p>
          </div>
          
          <div className="flex flex-col items-center p-6 space-y-4 bg-white border rounded-2xl border-slate-100 shadow-sm">
            <div className="p-3 rounded-full bg-blue-50 text-primary-600">
              <Rocket size={24} />
            </div>
            <h3 className="text-xl font-bold">Easy Deploy</h3>
            <p className="text-slate-500">Containerized ready for instant deployment to Render, Railway, or any VPS.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
