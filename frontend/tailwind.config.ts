import type { Config } from 'tailwindcss'

/**
 * DocuVault Tailwind config — token-bound to CSS variables in globals.css.
 * Theme switches via [data-theme="light"] on <html>, not the .dark class.
 * Use bracket utilities for the most theme-honest results, e.g.
 *   text-ink, text-ink-dim, bg-surface, bg-surface-raised, border-line, border-line-hot
 *   text-ember, bg-ember, ring-ember/30
 */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['"Inter Tight"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Smaller defaults — letterpress-instrument density
        xxs: '10px',
        xs: '11px',
        sm: '12px',
        base: '13px',
        md: '14px',
        lg: '17px',
        xl: '21px',
        '2xl': '26px',
        '3xl': '32px',
        '4xl': '42px',
      },
      letterSpacing: {
        kicker: '0.22em',
        button: '0.18em',
      },
      colors: {
        ember: {
          DEFAULT: 'var(--ember)',
          deep: 'var(--ember-deep)',
          glow: 'var(--ember-glow)',
          wash: 'var(--ember-wash)',
        },
        ink: {
          DEFAULT: 'var(--ink)',
          dim: 'var(--ink-dim)',
          faint: 'var(--ink-faint)',
        },
        surface: {
          DEFAULT: 'var(--bg)',
          raised: 'var(--bg-2)',
          sunken: 'var(--bg-3)',
        },
        line: {
          DEFAULT: 'var(--line)',
          hot: 'var(--line-hot)',
        },
        // Status palette — token-bound
        ok: 'var(--green)',
        bad: 'var(--red)',
        warn: 'var(--warn)',
        info: 'var(--blue)',
      },
      width: {
        sidebar: '240px',
        'sidebar-collapsed': '64px',
      },
      borderRadius: {
        // Hard rectangles — letterpress aesthetic. Rounded utilities
        // resolve to 0 so accidental usage doesn't break the language.
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '9999px', // keep for circular avatars / spinners
      },
      transitionTimingFunction: {
        instrument: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config
