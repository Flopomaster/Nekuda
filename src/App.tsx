import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { DataProvider } from './hooks/useData'
import { hasPin, watchVisibility } from './lib/lock'
import { supabase } from './lib/supabase'
import { Dashboard } from './pages/Dashboard'
import { Finance } from './pages/Finance'
import { LockScreen } from './pages/LockScreen'
import { Login } from './pages/Login'
import { SettingsPage } from './pages/Settings'
import { Tasks } from './pages/Tasks'

const SKIP_KEY = 'nekuda.pinSkipped'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [locked, setLocked] = useState(hasPin)
  const [needsPin, setNeedsPin] = useState(() => !hasPin() && sessionStorage.getItem(SKIP_KEY) !== '1')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => watchVisibility(() => setLocked(true)), [])

  if (session === undefined) return <div className="spinner" />
  if (!session) return <Login />
  if (locked && hasPin()) return <LockScreen mode="unlock" onDone={() => setLocked(false)} />
  if (needsPin) {
    return <LockScreen mode="setup" onDone={() => setNeedsPin(false)}
      onSkip={() => { sessionStorage.setItem(SKIP_KEY, '1'); setNeedsPin(false) }} />
  }

  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="finance" element={<Finance />} />
            <Route path="tasks" element={<Tasks />} />
            <Route path="settings" element={<SettingsPage email={session.user.email ?? ''} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </DataProvider>
  )
}
