import { create } from 'zustand'

type Theme = 'dark' | 'light'

interface ThemeState {
  theme: Theme
  dark: boolean
  toggle: () => void
  set: (t: Theme) => void
}

const apply = (t: Theme) => {
  document.documentElement.setAttribute('data-theme', t)
  localStorage.setItem('theme', t)
}

const initial: Theme =
  (localStorage.getItem('theme') as Theme | null) === 'light' ? 'light' : 'dark'

apply(initial)

export const useThemeStore = create<ThemeState>((set) => ({
  theme: initial,
  dark: initial === 'dark',
  toggle: () =>
    set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
      apply(next)
      return { theme: next, dark: next === 'dark' }
    }),
  set: (t) =>
    set(() => {
      apply(t)
      return { theme: t, dark: t === 'dark' }
    }),
}))
