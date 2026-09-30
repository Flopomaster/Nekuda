import { useEffect, useState } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'nekuda.theme'

const read = (): ThemePref => {
  try { return (localStorage.getItem(KEY) as ThemePref) || 'system' } catch { return 'system' }
}

function apply(pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#140b0d' : '#7a1f2b')
}

// Apply before first render to avoid a flash
apply(read())

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read)
  useEffect(() => {
    apply(pref)
    try { localStorage.setItem(KEY, pref) } catch { /* private mode */ }
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => apply(pref)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [pref])
  return [pref, setPref] as const
}

export const isDark = () => document.documentElement.dataset.theme === 'dark'
