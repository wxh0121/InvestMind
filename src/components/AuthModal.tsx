import { type FormEvent, useState } from "react";
import { LogIn, UserPlus, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

type AuthMode = "login" | "register";

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { login, register, error, clearError } = useAuth();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState("");

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setLocalError("");
    clearError();

    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      onClose();
    } catch (nextError) {
      setLocalError(nextError instanceof Error ? nextError.message : "账号请求失败");
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setLocalError("");
    clearError();
  };

  const visibleError = localError || error;

  return (
    <div className="fixed inset-0 z-50 grid min-h-dvh place-items-center overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-sm sm:py-8">
      <form
        className="surface my-auto max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto p-4 sm:p-5"
        onSubmit={submit}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {mode === "login" ? "登录 InvestMind" : "创建账号"}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              登录后会把持仓备份到云端数据库。
            </p>
          </div>
          <button className="btn-secondary h-9 w-9 px-0" type="button" onClick={onClose} aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" role="tablist">
          <button
            className={mode === "login" ? "btn-primary h-9" : "btn-secondary h-9 border-transparent shadow-none"}
            type="button"
            onClick={() => switchMode("login")}
            aria-selected={mode === "login"}
            role="tab"
          >
            <LogIn className="h-4 w-4" />
            登录
          </button>
          <button
            className={mode === "register" ? "btn-primary h-9" : "btn-secondary h-9 border-transparent shadow-none"}
            type="button"
            onClick={() => switchMode("register")}
            aria-selected={mode === "register"}
            role="tab"
          >
            <UserPlus className="h-4 w-4" />
            注册
          </button>
        </div>

        <div className="space-y-3">
          <label className="space-y-1.5">
            <span className="label">邮箱</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
          </label>
          <label className="space-y-1.5">
            <span className="label">密码</span>
            <input
              className="input"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
            />
          </label>
        </div>

        {visibleError ? (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
            {visibleError}
          </p>
        ) : null}

        <button className="btn-primary mt-5 w-full" type="submit" disabled={submitting}>
          {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {submitting ? "处理中" : mode === "login" ? "登录" : "注册并同步"}
        </button>

        <button
          className="mt-3 w-full text-center text-sm font-medium text-coral-700 dark:text-coral-300"
          type="button"
          onClick={() => switchMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "没有账号？注册一个" : "已有账号？去登录"}
        </button>
      </form>
    </div>
  );
}
