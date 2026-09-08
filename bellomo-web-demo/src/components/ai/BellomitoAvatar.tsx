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
    sm: 32,
    md: 40,
    lg: 48,
    xl: 56,
  };

  const dotSizes = {
    sm: "h-2 w-2 border-2",
    md: "h-2.5 w-2.5 border-2",
    lg: "h-2.5 w-2.5 border-2",
    xl: "h-3 w-3 border-2",
  };

  return (
    <div className={`bellomito-avatar relative inline-flex shrink-0 ${className}`}>
      {/* Transparent character silhouette */}
      <div
        className={`bellomito-character flex ${sizeClasses[size]} items-center justify-center text-white`}
      >
        <BellomitoIcon size={iconSizes[size]} />
      </div>

      {/* Online Status Green Dot */}
      {showOnlineStatus && (
        <div
          className={`absolute bottom-0.5 right-0.5 ${dotSizes[size]} rounded-full border-slate-950 bg-emerald-500 shadow-sm`}
          title="Bellomito en línea"
        >
          
        </div>
      )}
    </div>
  );
}

