import React from 'react';
import { classifyJunctionStatus, useTheme } from '../utils/semantics';

export function StatusGlyph({ shape, color, size = 10 }) {
  if (shape === 'cross') {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
        <path d="M4.5 1h3v3.5H11v3H7.5V11h-3V7.5H1v-3h3.5z" fill={color} />
      </svg>
    );
  }
  if (shape === 'octagon') {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
        <polygon points="3.6,1 8.4,1 11,3.6 11,8.4 8.4,11 3.6,11 1,8.4 1,3.6" fill={color} />
      </svg>
    );
  }
  if (shape === 'triangle') {
    return (
      <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
        <polygon points="6,1.5 11,10.5 1,10.5" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className="shrink-0">
      <circle cx="6" cy="6" r="4.5" fill={color} />
    </svg>
  );
}

export function StatusPill({ junction, className = '' }) {
  const { isDark } = useTheme();
  const info = classifyJunctionStatus(junction, isDark);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[11px] font-medium whitespace-nowrap ${info.pillClass} ${className}`}
    >
      <StatusGlyph shape={info.shape} color={info.hex} size={9} />
      <span>{info.label}</span>
    </span>
  );
}
