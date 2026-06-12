import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { PortfolioProvider } from "@/context/PortfolioContext";
import { Navigation } from "@/routes/Navigation";
import { AppRoutes } from "@/routes/AppRoutes";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <PortfolioProvider>
          <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
            <Navigation />
            <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
              <AppRoutes />
            </main>
            <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-slate-500 dark:text-slate-400 sm:px-6 lg:px-8">
              本工具仅用于个人资产记录与规则化分析，不构成任何投资建议。投资有风险，决策需谨慎。
            </footer>
          </div>
        </PortfolioProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
