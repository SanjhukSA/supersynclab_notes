import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      /* ── Color tokens from ui-context.md ─────────────────────────── */
      colors: {
        bg: {
          base: "var(--bg-base)",
          surface: "var(--bg-surface)",
          raised: "var(--bg-raised)",
        },
        text: {
          primary: "var(--text-primary)",
          muted: "var(--text-muted)",
        },
        accent: {
          primary: "var(--accent-primary)",
          highlight: "var(--accent-highlight)",
        },
        border: {
          DEFAULT: "var(--border-default)",
        },
        state: {
          error: "var(--state-error)",
          success: "var(--state-success)",
        },
      },

      /* ── Typography from ui-context.md ──────────────────────────── */
      fontFamily: {
        display: ["Fraunces", "Georgia", "serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },

      /* ── Border radius scale ────────────────────────────────────── */
      borderRadius: {
        lg: "0.625rem",
        md: "0.375rem",
        xl: "0.875rem",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
