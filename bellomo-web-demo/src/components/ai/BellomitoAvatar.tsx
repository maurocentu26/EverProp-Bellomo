"use client";

import React from "react";
import { BellomitoIcon } from "./BellomitoIcon";

interface BellomitoAvatarProps {
  size?: "sm" | "md" | "lg" | "xl";
  showOnlineStatus?: boolean;
  className?: string;
}

export function BellomitoAvatar({
  size = "md",
  showOnlineStatus = true,
  className = "",
}: BellomitoAvatarProps) {
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
    xl: "h-14 w-14",
  };

  const iconSizes = {
    sm: 20,
    md: 26,
    lg: 32,
    xl: 38,
  };

  const dotSizes = {
    sm: "h-2.5 w-2.5 border-1.5",
    md: "h-3 w-3 border-2",
    lg: "h-3.5 w-3.5 border-2",
    xl: "h-4 w-4 border-2",
  };

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {/* Gradient Container */}
      <div
        className={`flex ${sizeClasses[size]} items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-indigo-500 text-white shadow-md shadow-blue-600/25 ring-2 ring-white/20`}
      >
        <BellomitoIcon size={iconSizes[size]} />
      </div>

      {/* Online Status Green Dot */}
      {showOnlineStatus && (
        <div
          className={`absolute -bottom-0.5 -right-0.5 ${dotSizes[size]} rounded-full border-slate-950 bg-emerald-500 shadow-sm`}
          title="Bellomito en línea"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        </div>
      )}
    </div>
  );
}

