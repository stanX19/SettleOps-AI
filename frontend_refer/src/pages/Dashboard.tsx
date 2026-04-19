import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, User as UserIcon, Activity, FileCode2 } from "lucide-react";
import { ChatPanel } from "../components/chat/ChatPanel";

interface User {
  id: number;
  username: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/users/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch user");
        }

        const data = await response.json();
        setUser(data);
      } catch (err) {
        console.error(err);
        localStorage.removeItem("token");
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Activity className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <nav className="border-b bg-white/50 backdrop-blur-sm border-slate-200 sticky top-0 z-10">
          <div className="px-4 mx-auto max-w-7xl sm:px-6 lg:px-8 w-full">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <span className="text-xl font-bold text-primary-600">Skeleton App</span>
              </div>
              <div className="flex items-center space-x-4">
                <a
                  href={`${API_URL}/docs`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center text-sm font-medium transition-colors text-slate-600 hover:text-primary-600"
                >
                  <FileCode2 className="w-4 h-4 mr-1" />
                  API Docs
                </a>
                <div className="w-px h-5 bg-slate-200"></div>
                <div className="flex items-center space-x-2 text-slate-600">
                  <UserIcon className="w-5 h-5" />
                  <span className="font-medium">{user?.username}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center px-3 py-2 text-sm font-medium text-red-600 transition-colors bg-red-50 rounded-md hover:bg-red-100"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>

        <main className="flex-1 py-10 w-full max-w-7xl mx-auto sm:px-6 lg:px-8">
          <div className="px-4 py-8 bg-white border shadow-sm sm:px-6 rounded-xl border-slate-200">
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="mt-2 text-slate-600">
              Welcome back, <span className="font-semibold text-primary-600">{user?.username}</span>! This is your protected dashboard.
            </p>
            
            <div className="p-4 mt-8 bg-blue-50 border border-blue-100 rounded-lg">
              <h3 className="text-sm font-medium text-blue-800">You successfully authenticated</h3>
              <div className="mt-2 text-sm text-blue-700">
                <p>User ID: {user?.id}</p>
                <p>Username: {user?.username}</p>
              </div>
            </div>
          </div>
        </main>
      </div>

      <ChatPanel />
    </div>
  );
}
