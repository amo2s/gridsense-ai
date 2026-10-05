"use client";

import React from "react";
import { motion, HTMLMotionProps } from "framer-motion";

interface MotionMainProps extends HTMLMotionProps<"main"> {
  layoutId: string;
}

export function MotionMain({ layoutId, children, ...props }: MotionMainProps) {
  return (
    <motion.main
      layoutId={layoutId}
      transition={{ type: "spring", stiffness: 350, damping: 25 }}
      {...props}
    >
      {children}
    </motion.main>
  );
}
