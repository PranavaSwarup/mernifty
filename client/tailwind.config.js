/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Public Sans', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ground: 'rgb(var(--bg-ground-rgb) / <alpha-value>)',
        surface: 'rgb(var(--bg-surface-rgb) / <alpha-value>)',
        inset: 'rgb(var(--bg-inset-rgb) / <alpha-value>)',
        hairline: 'rgb(var(--border-subtle-rgb) / <alpha-value>)',
        hairlineStrong: 'rgb(var(--border-strong-rgb) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent-rgb) / <alpha-value>)',
          ink: 'rgb(var(--accent-ink-rgb) / <alpha-value>)',
          tint: 'var(--accent-tint)',
          contrast: 'var(--accent-contrast)',
        },
        ink: {
          primary: 'rgb(var(--text-primary-rgb) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary-rgb) / <alpha-value>)',
          muted: 'rgb(var(--text-muted-rgb) / <alpha-value>)',
        },
        signal: {
          accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
          flow: 'rgb(var(--state-flow-rgb) / <alpha-value>)',
          heavy: 'rgb(var(--state-heavy-rgb) / <alpha-value>)',
          gridlock: 'rgb(var(--state-gridlock-rgb) / <alpha-value>)',
          emergency: 'rgb(var(--state-emergency-rgb) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
