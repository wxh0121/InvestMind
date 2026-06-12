import { Route, Routes } from "react-router-dom";
import { Dashboard } from "@/pages/Dashboard";
import { Holdings } from "@/pages/Holdings";
import { Analysis } from "@/pages/Analysis";
import { SettingsPage } from "@/pages/Settings";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/holdings" element={<Holdings />} />
      <Route path="/analysis" element={<Analysis />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Routes>
  );
}
