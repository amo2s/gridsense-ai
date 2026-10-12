"use client";

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "default" | "outline" | "ghost" | "secondary" | "danger";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "disabled" | "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  default: "bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20 border-transparent",
  outline: "border border-white/70 bg-white/50 hover:bg-white/80 text-slate-700 shadow-xs backdrop-blur-md hover:border-white",
  ghost: "bg-transparent hover:bg-white/40 text-slate-700 shadow-none border-transparent",
  secondary: "bg-slate-100 hover:bg-slate-200/80 text-slate-800 border-slate-200/70 shadow-xs",
  danger: "bg-rose-500 text-white hover:bg-rose-600 shadow-md shadow-rose-500/20 border-transparent",
};

const sizeStyles: Record<ButtonSize, string> = {
  default: "py-2.5 px-4 text-sm rounded-xl",
  sm: "py-1.5 px-3 text-xs rounded-xl",
  lg: "py-3 px-6 text-base rounded-2xl",
  icon: "p-2 h-8 w-8 rounded-xl",
};

export function Button({ 
  children, 
  className = "", 
  variant = "default",
  size = "default",
  isLoading, 
  disabled, 
  ...props 
}: ButtonProps) {
  const selectedVariantClass = variantStyles[variant] || variantStyles.default;
  const selectedSizeClass = sizeStyles[size] || sizeStyles.default;

  return (
    <motion.button
      disabled={disabled || isLoading}
      whileHover={{ scale: disabled || isLoading ? 1 : 1.01 }}
      whileTap={{ scale: disabled || isLoading ? 1 : 0.96 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={`relative inline-flex items-center justify-center overflow-hidden font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:ring-offset-2 disabled:opacity-60 disabled:pointer-events-none cursor-pointer ${selectedVariantClass} ${selectedSizeClass} ${className}`}
      {...props}
    >
      {/* Specular shimmer effect */}
      <motion.span
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        initial={{ x: "-120%" }}
        animate={{ x: "120%" }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear", repeatDelay: 1.5 }}
      />
      {isLoading ? (
        <span className="relative z-10 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-current" />
        </span>
      ) : (
        <span className="relative z-10 flex items-center justify-center gap-1.5 w-full">
          {children}
        </span>
      )}
    </motion.button>
  );
}

export default Button;
