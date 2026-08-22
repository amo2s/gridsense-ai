"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
// Stepping out of app/portal/ to reach the root components folder
import LoginForm from "../../components/auth/login-form";
import RegisterForm from "../../components/auth/register-form";

export default function AuthPortal() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="flex min-h-screen items-center justify-center bg-emerald-50/30 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white p-8 shadow-2xl shadow-emerald-900/5 border border-emerald-100">
        
        {/* Header Section */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            {/* Simple geometric icon representing a grid/leaf */}
            <div className="h-5 w-5 rounded-sm bg-emerald-600 rotate-45" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-emerald-950">
            GridSense AI
          </h1>
          <p className="mt-2 text-sm text-emerald-700/70">
            {isLogin ? "Secure access to grid telemetry." : "Request operational clearance."}
          </p>
        </div>

        {/* Animated Pill Switch */}
        <div className="relative mb-8 flex h-12 w-full rounded-full bg-emerald-50/80 p-1">
          <motion.div
            className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-white shadow-sm border border-emerald-100/50"
            animate={{ x: isLogin ? 0 : "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
          />
          
          <button
            onClick={() => setIsLogin(true)}
            className={`relative z-10 w-1/2 rounded-full text-sm font-medium transition-colors ${
              isLogin ? "text-emerald-700" : "text-emerald-700/50 hover:text-emerald-700"
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => setIsLogin(false)}
            className={`relative z-10 w-1/2 rounded-full text-sm font-medium transition-colors ${
              !isLogin ? "text-emerald-700" : "text-emerald-700/50 hover:text-emerald-700"
            }`}
          >
            Register
          </button>
        </div>

        {/* Form Container with Smooth Sliding Transitions */}
        <div className="relative">
          <AnimatePresence mode="wait">
            {isLogin ? (
              <motion.div
                key="login"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ duration: 0.2 }}
              >
                <LoginForm />
              </motion.div>
            ) : (
              <motion.div
                key="register"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                <RegisterForm />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
      </div>
    </div>
  );
}