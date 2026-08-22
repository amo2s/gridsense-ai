"use client";

import { useState } from "react";
import { Mail, Lock, Loader2, CheckCircle2 } from "lucide-react";
import api from "../../src/lib/api";

export default function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await api.post("/auth/register", { email, password });
      setSuccess(true);
    } catch (err: any) {
      setError(err.response?.data?.error || "Registration failed. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-6 text-center">
        <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        <h3 className="text-lg font-semibold text-emerald-950">Request Sent</h3>
        <p className="text-sm text-emerald-700/70">
          Your account has been created and is pending administrator approval.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleRegister} className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="relative">
        <Mail className="absolute left-3 top-3 h-5 w-5 text-emerald-600/50" />
        <input
          type="email"
          placeholder="Corporate Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-xl border border-emerald-100 bg-emerald-50/30 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
        />
      </div>

      <div className="relative">
        <Lock className="absolute left-3 top-3 h-5 w-5 text-emerald-600/50" />
        <input
          type="password"
          placeholder="Choose a strong password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-emerald-100 bg-emerald-50/30 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mt-2 flex w-full items-center justify-center rounded-xl bg-emerald-950 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-900 active:scale-[0.98] disabled:opacity-70 shadow-lg shadow-emerald-900/20"
      >
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Request Access"}
      </button>
    </form>
  );
}