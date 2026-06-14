import { NavLink } from "react-router-dom";
import { BarChart3, Cloud, CloudOff, Home, LogOut, Moon, Plus, Settings, Sun, Table2, User } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthModal } from "@/components/AuthModal";
import { useAuth } from "@/context/AuthContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { cn } from "@/utils/format";

const navItems = [
  { to: "/", label: "首页", icon: Home },
  { to: "/holdings", label: "持仓", icon: Table2 },
  { to: "/analysis", label: "分析", icon: BarChart3 },
  { to: "/settings", label: "设置", icon: Settings }
];

export function Navigation() {
  const { user, loading: authLoading, logout } = useAuth();
  const { cloudSyncStatus, cloudSyncMessage, clearLocalData } = usePortfolio();
  const [authOpen, setAuthOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof localStorage === "undefined") return false;
    const saved = localStorage.getItem("theme");
    return saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const cloudIcon =
    cloudSyncStatus === "local" || cloudSyncStatus === "error" ? (
      <CloudOff className="h-4 w-4" />
    ) : (
      <Cloud className={cn("h-4 w-4", cloudSyncStatus === "syncing" && "animate-pulse")} />
    );

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      await clearLocalData();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header className="app-header sticky top-0 z-40 border-b border-slate-200 bg-slate-50/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3">
          <NavLink to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-[#FFFDF8] p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <img className="h-full w-full" src="/icons/icon.svg" alt="" aria-hidden="true" />
            </span>
            <span className="display-serif text-2xl text-slate-950 dark:text-slate-50">InvestMind</span>
          </NavLink>
          <button
            className="btn-secondary h-10 w-10 px-0 sm:hidden"
            type="button"
            onClick={() => setDark((value) => !value)}
            aria-label="切换深色模式"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <nav className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  cn(
                    "btn h-9 shrink-0 border px-3",
                    isActive
                      ? "border-coral-500 bg-coral-500 text-white shadow-sm dark:border-coral-400 dark:bg-coral-400 dark:text-slate-950"
                      : "border-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-900"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
          <NavLink className="btn-primary hidden h-9 shrink-0 sm:inline-flex" to="/holdings">
            <Plus className="h-4 w-4" />
            新增
          </NavLink>
          <span
            className={cn(
              "hidden h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm sm:inline-flex",
              cloudSyncStatus === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200"
                : "border-slate-200 bg-[#FFFDF8] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            )}
            title={cloudSyncMessage}
          >
            {cloudIcon}
            {cloudSyncStatus === "syncing" ? "同步中" : cloudSyncStatus === "synced" ? "云端" : "本机"}
          </span>
          {user ? (
            <button className="btn-secondary h-9 shrink-0" type="button" onClick={() => void handleLogout()} disabled={loggingOut}>
              <LogOut className="h-4 w-4" />
              <span className="max-w-28 truncate">{loggingOut ? "退出中" : user.email}</span>
            </button>
          ) : (
            <button
              className="btn-secondary h-9 shrink-0"
              type="button"
              onClick={() => setAuthOpen(true)}
              disabled={authLoading}
            >
              <User className="h-4 w-4" />
              登录
            </button>
          )}
          <button
            className="btn-secondary hidden h-9 w-9 px-0 sm:inline-flex"
            type="button"
            onClick={() => setDark((value) => !value)}
            aria-label="切换深色模式"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </nav>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
  );
}
