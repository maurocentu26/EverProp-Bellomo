"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Command, FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import { MOCK_USERS } from "@/data/auth-sample";
import { useAuth } from "@/lib/auth-context";
import { isMockDataMode } from "@/lib/data-mode";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const { login, loginDemo, currentUser, isLoaded } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("");
  const [selectedEmail, setSelectedEmail] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (isLoaded && currentUser) router.replace("/admin");
  }, [isLoaded, currentUser, router]);

  const handleApiLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setLoadingLabel("Conectando con EverProp API…");
    setError("");

    try {
      await login(email.trim(), password);
      router.push("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible iniciar sesión.");
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async (demoEmail: string) => {
    setIsLoading(true);
    setLoadingLabel("Iniciando modo demo aislado…");
    setSelectedEmail(demoEmail);
    setError("");

    try {
      await loginDemo(demoEmail);
      router.push("/admin");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No fue posible iniciar el modo demo.");
      setIsLoading(false);
    }
  };

  if (!isLoaded || currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-label="Cargando sesión" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="relative isolate flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.15),transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.8)_0%,rgba(2,6,23,1)_100%)]" />
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 animate-pulse rounded-full bg-blue-500/20 blur-xl" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 shadow-xl shadow-blue-600/30">
              <Command className="h-8 w-8 text-white" aria-hidden="true" />
            </div>
          </div>
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" aria-hidden="true" />
          <p className="text-sm font-medium tracking-wide text-slate-300" role="status">
            {loadingLabel}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_40%),linear-gradient(180deg,rgba(15,23,42,0.8)_0%,rgba(2,6,23,1)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-size-[64px_64px] opacity-20 mask-[linear-gradient(to_bottom,white,transparent_90%)]" />

      <div className="relative z-10 mx-auto w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 shadow-lg shadow-blue-600/30">
            <Command className="h-7 w-7 text-white" aria-hidden="true" />
          </div>
          <h1 className="mb-2 text-3xl font-semibold tracking-tight text-white">EverProp · Bellomo</h1>
          <p className="text-sm text-slate-400">
            {isMockDataMode
              ? "Entorno aislado para QA visual con datos no reales."
              : "Acceso al panel mediante una sesión real de EverProp."}
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/50 backdrop-blur-md sm:p-7">
          {isMockDataMode ? (
            <>
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4" role="note">
                <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-white">QA visual mock</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    Usa muestras y localStorage. No crea una sesión ni confirma datos u operaciones en la API.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {MOCK_USERS.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => void handleDemoLogin(user.email)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-3 text-left transition-all hover:border-white/20 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-400",
                      selectedEmail === user.email && "border-amber-400 bg-amber-400/10",
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-xs font-bold text-white shadow-inner">
                      {user.avatar}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-xs font-semibold text-white">{user.name}</h3>
                      <p className="truncate text-[10px] text-slate-400">{user.role} · mock</p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" aria-hidden="true" />
                <div>
                  <h2 className="text-sm font-semibold text-white">Sesión real EverProp</h2>
                  <p className="mt-1 text-xs leading-5 text-slate-300">Usa Sanctum, tenant Bellomo y las credenciales existentes de la API local.</p>
                </div>
              </div>

              <form onSubmit={handleApiLogin} className="space-y-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="username"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-normal normal-case tracking-normal text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </label>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Contraseña
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete="current-password"
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm font-normal normal-case tracking-normal text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30"
                  />
                </label>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                >
                  Ingresar con EverProp API
                </button>
              </form>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-100" role="alert">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  {error}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
