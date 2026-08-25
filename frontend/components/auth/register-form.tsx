"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mail, Lock, Loader2, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";
import api from "../../src/lib/api";

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

function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong", "Excellent"];
  return { score, label: labels[score] };
}

export default function RegisterForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);

  const strength = useMemo(() => getPasswordStrength(password), [password]);
  const strengthColors = [
    "bg-red-400",
    "bg-red-400",
    "bg-amber-400",
    "bg-lime-500",
    "bg-emerald-500",
    "bg-emerald-600",
  ];

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

  return (
    <AnimatePresence mode="wait">
      {success ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex flex-col items-center justify-center space-y-4 overflow-hidden rounded-2xl bg-gradient-to-b from-emerald-50/80 to-white py-8 text-center"
        >
          <motion.div
            initial={{ scale: 0, rotate: -45 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.15, type: "spring", stiffness: 260, damping: 18 }}
            className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30"
          >
            <CheckCircle2 className="h-9 w-9 text-white" strokeWidth={2.2} />
            <motion.span
              initial={{ scale: 0.8, opacity: 0.6 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
              className="absolute inset-0 rounded-full bg-emerald-400"
            />
          </motion.div>

          <motion.h3
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-r from-emerald-950 to-emerald-700 bg-clip-text text-lg font-semibold text-transparent"
          >
            Request Sent
          </motion.h3>
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="max-w-xs text-sm text-emerald-700/70"
          >
            Your account has been created and is pending administrator approval.
          </motion.p>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          variants={container}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, y: -8 }}
          onSubmit={handleRegister}
          className="flex flex-col gap-4"
        >
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: "auto", marginBottom: 0 }}
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
              className="pointer-events-none absolute inset-0 rounded-xl ring-emerald-500/10"
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
            <div className="relative">
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
                placeholder="Choose a strong password"
                required
                minLength={8}
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
            </div>

            {/* Smart strength meter */}
            <AnimatePresence>
              {password && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="mt-2 space-y-1.5 overflow-hidden"
                >
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <motion.span
                        key={i}
                        initial={{ scaleX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: i * 0.03, duration: 0.2 }}
                        className={`h-1 flex-1 origin-left rounded-full transition-colors duration-300 ${
                          i < strength.score ? strengthColors[strength.score] : "bg-emerald-100"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-emerald-700/60">
                    <ShieldCheck className="h-3 w-3" />
                    <span>{strength.label}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.button
            variants={item}
            type="submit"
            disabled={isLoading}
            whileHover={{ scale: isLoading ? 1 : 1.01 }}
            whileTap={{ scale: isLoading ? 1 : 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            className="relative mt-2 flex w-full items-center justify-center overflow-hidden rounded-xl bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 disabled:opacity-70"
          >
            <motion.span
              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
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
                  className="relative z-10"
                >
                  Request Access
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </motion.form>
      )}
    </AnimatePresence>
  );
}