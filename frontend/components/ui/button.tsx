"use client";

import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "disabled" | "children"> {
  isLoading?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

export function Button({ 
  children, 
  className = "", 
  isLoading, 
  disabled, 
  ...props 
}: ButtonProps) {
  return (
    <motion.button
      disabled={disabled || isLoading}
      whileHover={{ scale: disabled || isLoading ? 1 : 1.01 }}
      whileTap={{ scale: disabled || isLoading ? 1 : 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={`relative flex items-center justify-center overflow-hidden rounded-xl py-3 px-4 text-sm font-semibold shadow-lg disabled:opacity-70 ${className}`}
      {...props}
    >
      {/* Shimmer effect extracted from base auth buttons */}
      <motion.span
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        initial={{ x: "-120%" }}
        animate={{ x: "120%" }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "linear", repeatDelay: 1 }}
      />
      {isLoading ? (
        <span className="relative z-10 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
      ) : (
        <span className="relative z-10 flex items-center justify-center gap-1.5 w-full">
          {children}
        </span>
      )}
    </motion.button>
  );
}
