"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, Lock, Loader2, AlertCircle, ArrowRight } from "lucide-react";
// Assuming api.ts is in src/lib/api.ts
import api from "../../src/lib/api";
import { AuthResponse } from "../../src/types/auth";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
};

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const res = await api.post<AuthResponse>("/auth/login", { email, password });

      // Matches the real envelope: { status, data: { access_token, user } }
      const accessToken = res.data.data?.access_token;
      const user = res.data.data?.user;

      // Defensive check: don't proceed if the backend didn't actually return a token
      if (!accessToken) {
        setError("Login succeeded but no session token was returned. Please try again.");
        setIsLoading(false);
        return;
      }

      // sessionStorage instead of localStorage: the token is cleared automatically
      // when the tab/window closes, rather than persisting indefinitely on the device.
      // Note: this is still JS-readable (XSS can still steal it) — the real session
      // boundary for protected routes is the HttpOnly `auth_token` cookie the backend
      // sets, which middleware verifies server-side. This copy is only for attaching
      // Authorization headers on direct client-side API calls.
      sessionStorage.setItem("access_token", accessToken);
      sessionStorage.setItem("user_role", user?.role || "Staff");

      setRedirecting(true);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.error || "Invalid credentials. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {redirecting ? (
        <motion.div
          key="redirecting"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-50/80 to-white py-10 text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-lg shadow-emerald-600/30"
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <Loader2 className="h-7 w-7 text-white" />
            </motion.div>
          </motion.div>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-gradient-to-r from-emerald-950 to-emerald-700 bg-clip-text text-sm font-medium text-transparent"
          >
            Signed in — taking you to your dashboard
          </motion.p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          variants={container}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, y: -8 }}
          onSubmit={handleLogin}
          className="flex flex-col gap-4"
        >
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="flex items-center gap-2 overflow-hidden rounded-lg border border-red-100 bg-gradient-to-r from-red-50 to-red-50/60 p-3 text-sm text-red-600"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email field */}
          <motion.div variants={item} className="relative">
            <motion.div
              animate={{
                color: focusedField === "email" ? "#059669" : "rgba(5,150,105,0.5)",
              }}
              className="pointer-events-none absolute left-3 top-3"
            >
              <Mail className="h-5 w-5" />
            </motion.div>
            <input
              type="email"
              placeholder="Corporate Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => setFocusedField(null)}
              className="w-full rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/50 to-emerald-50/20 py-3 pl-10 pr-4 text-sm text-emerald-950 outline-none transition-colors duration-200 placeholder:text-emerald-900/30 focus:border-emerald-500 focus:bg-white"
            />
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-xl"
              animate={{
                boxShadow:
                  focusedField === "email"
                    ? "0 0 0 4px rgba(16,185,129,0.12)"
                    : "0 0 0 0px rgba(16,185,129,0)",
              }}
              transition={{ duration: 0.2 }}
            />
          </motion.div>

          {/* Password field */}
          <motion.div variants={item} className="relative">
            <motion.div
              animate={{
                color: focusedField === "password" ? "#059669" : "rgba(5,150,105,0.5)",
              }}
              className="pointer-events-none absolute left-3 top-3"
            >
              <Lock className="h-5 w-5" />
            </motion.div>
            <input
              type="password"
              placeholder="Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onFocus={() => setFocusedField("password")}
              onBlur={() => setFocusedField(null)}
              className="w-full rounded-xl border border-emerald-100 bg-gradient-to-b from-emerald-50/50 to-emerald-50/20 py-3 pl-10 pr-4 text-sm text-emerald-950 outline-none transition-colors duration-200 placeholder:text-emerald-900/30 focus:border-emerald-500 focus:bg-white"
            />
            <motion.div
              className="pointer-events-none absolute inset-0 rounded-xl"
              animate={{
                boxShadow:
                  focusedField === "password"
                    ? "0 0 0 4px rgba(16,185,129,0.12)"
                    : "0 0 0 0px rgba(16,185,129,0)",
              }}
              transition={{ duration: 0.2 }}
            />
          </motion.div>

          <motion.button
            variants={item}
            type="submit"
            disabled={isLoading}
            whileHover={{ scale: isLoading ? 1 : 1.01 }}
            whileTap={{ scale: isLoading ? 1 : 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-600 via-emerald-600 to-emerald-700 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 disabled:opacity-70"
          >
            <motion.span
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
              initial={{ x: "-120%" }}
              animate={{ x: "120%" }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
            />
            <AnimatePresence mode="wait" initial={false}>
              {isLoading ? (
                <motion.span
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative z-10"
                >
                  <Loader2 className="h-5 w-5 animate-spin" />
                </motion.span>
              ) : (
                <motion.span
                  key="label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative z-10 flex items-center gap-1.5"
                >
                  Sign In
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}