"use client";

import React, { useId } from "react";

interface BellomitoIconProps {
  className?: string;
  size?: number | string;
}

/** A readable B character with Bellomo's straight edges and chamfered corners. */
export function BellomitoIcon({ className = "", size = 32 }: BellomitoIconProps) {
  const materialId = useId();
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className={`block shrink-0 select-none ${className}`}>
      <defs>
        <linearGradient id={materialId} x1="24" y1="14" x2="76" y2="88" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff8e7" />
          <stop offset=".42" stopColor="#eedbb0" />
          <stop offset="1" stopColor="#caa363" />
        </linearGradient>
      </defs>
      {/* Extruded edges remain visible even with reduced motion enabled. */}
      <path d="M20 12H62L78 24V39L69 49L81 60V77L65 90H20Z" transform="translate(5 4)" fill="#8e6939" />
      <path d="M78 24L83 28V43L74 53L69 49L78 39ZM81 60L86 64V81L70 94L65 90L81 77Z" fill="#b48b50" />
      <path d="M20 12H62L78 24V39L69 49L81 60V77L65 90H20V12Z" fill={`url(#${materialId})`} />
      <path d="M21 89V13H62L77 25" stroke="#fff9ed" strokeOpacity=".8" strokeWidth="1.5" />
      {/* The two counters of the B become the face, on a shared center line. */}
      <path d="M38 27H60L66 32V39L60 44H38V27Z" fill="#082d40" />
      <path d="M38 58H61L68 64V73L61 78H38V58Z" fill="#082d40" />
      <path d="M38 44H60L66 39M38 78H61L68 73" stroke="#fff3d7" strokeOpacity=".65" strokeWidth="1.5" />
      <g className="bellomito-eyes">
        <ellipse cx="46" cy="35.5" rx="4.2" ry="5" fill="#fffaf0" />
        <ellipse cx="58" cy="35.5" rx="4.2" ry="5" fill="#fffaf0" />
        <circle cx="47" cy="35" r="2" fill="#082d40" />
        <circle cx="59" cy="35" r="2" fill="#082d40" />
      </g>
      <path d="M46 66Q52 73 59 66" stroke="#fffaf0" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
