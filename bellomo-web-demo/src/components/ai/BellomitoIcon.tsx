"use client";

import React from "react";

interface BellomitoIconProps {
  className?: string;
  size?: number | string;
}

export function BellomitoIcon({ className = "", size = 32 }: BellomitoIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <defs>
        <linearGradient id="bellomitoRobotGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2563eb" /> {/* Blue-600 */}
          <stop offset="100%" stopColor="#6366f1" /> {/* Indigo-500 */}
        </linearGradient>
        <filter id="bellomitoShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#1e3a8a" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Robot Antenna */}
      <line x1="50" y1="18" x2="50" y2="8" stroke="url(#bellomitoRobotGrad)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="50" cy="7" r="4.5" fill="#6366f1" />
      <circle cx="50" cy="7" r="2" fill="#38bdf8" />

      {/* Main "B" Robot Body / Head */}
      {/* Path forming a stylized capital letter B with rounded curves */}
      <path
        d="M 26 18 H 56 C 68 18 76 25 76 35 C 76 43 70 49 61 51 C 72 53 78 61 78 72 C 78 84 68 90 54 90 H 26 Z"
        fill="url(#bellomitoRobotGrad)"
        filter="url(#bellomitoShadow)"
      />

      {/* Subtle B Loop Inner Outlines */}
      <path d="M 38 28 H 53 C 58 28 62 31 62 36 C 62 41 58 44 53 44 H 38 Z" fill="#0f172a" fillOpacity="0.12" />
      <path d="M 38 58 H 52 C 58 58 63 62 63 68 C 63 74 58 78 52 78 H 38 Z" fill="#0f172a" fillOpacity="0.12" />

      {/* Friendly White Eyes (Two small white dots) in top loop */}
      <circle cx="45" cy="36" r="4.5" fill="#ffffff" />
      <circle cx="46" cy="35" r="1.8" fill="#1e40af" />
      <circle cx="47" cy="34" r="0.7" fill="#ffffff" />

      <circle cx="57" cy="36" r="4.5" fill="#ffffff" />
      <circle cx="58" cy="35" r="1.8" fill="#1e40af" />
      <circle cx="59" cy="34" r="0.7" fill="#ffffff" />

      {/* Friendly Robot Smile in bottom loop */}
      <path
        d="M 45 68 Q 50 72 55 68"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
