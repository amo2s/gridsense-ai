"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Lock, Loader2 } from "lucide-react";
// Assuming api.ts is in src/lib/api.ts
import api from "../../src/lib/api"; 
import { AuthResponse } from "../../src/types/auth";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await api.post<AuthResponse>("/auth/login", { email, password });
      
      localStorage.setItem("access_token", res.data.access_token!);
      localStorage.setItem("user_role", res.data.user?.role || "Staff");
      
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-4">
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
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-xl border border-emerald-100 bg-emerald-50/30 py-3 pl-10 pr-4 text-sm outline-none transition-all focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="mt-2 flex w-full items-center justify-center rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white transition-all hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-70 shadow-lg shadow-emerald-600/20"
      >
        {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
      </button>
    </form>
  );
}