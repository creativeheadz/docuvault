import { create } from 'zustand'

const GROUP_STORAGE_KEY = 'sidebar.collapsedGroups'

const loadCollapsedGroups = (): Record<string, boolean> => {
  try {
    const raw = localStorage.getItem(GROUP_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

const persistCollapsedGroups = (state: Record<string, boolean>) => {
  try {
    localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota / private-mode errors
  }
}

interface SidebarState {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (collapsed: boolean) => void
  collapsedGroups: Record<string, boolean>
  toggleGroup: (id: string) => void
  isGroupCollapsed: (id: string) => boolean
}

export const useSidebarStore = create<SidebarState>((set, get) => ({
  collapsed: false,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
  setCollapsed: (collapsed) => set({ collapsed }),

  collapsedGroups: loadCollapsedGroups(),
  toggleGroup: (id) => set((s) => {
    const next = { ...s.collapsedGroups, [id]: !s.collapsedGroups[id] }
    persistCollapsedGroups(next)
    return { collapsedGroups: next }
  }),
  isGroupCollapsed: (id) => !!get().collapsedGroups[id],
}))
