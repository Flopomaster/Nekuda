import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { IconCheckSquare, IconHome, IconPlus, IconSettings, IconWallet } from './Icons'
import { QuickAdd } from './QuickAdd'

const NAV = [
  { to: '/', label: 'בית', icon: IconHome, end: true },
  { to: '/finance', label: 'כספים', icon: IconWallet },
  { to: '/tasks', label: 'משימות', icon: IconCheckSquare },
  { to: '/settings', label: 'הגדרות', icon: IconSettings },
]

export function Layout() {
  const [quick, setQuick] = useState(false)
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><img src="/icon-192.png" alt="" /><span>נקודה</span></div>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="nav-link"><Icon />{label}</NavLink>
        ))}
        <div className="spacer" />
        <button className="btn primary block" onClick={() => setQuick(true)}><IconPlus />הוספה מהירה</button>
      </aside>
      <main className="main"><Outlet /></main>
      <nav className="bottom-nav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}><Icon />{label}</NavLink>
        ))}
      </nav>
      <button className="fab" onClick={() => setQuick(true)} aria-label="הוספה מהירה"><IconPlus /></button>
      {quick && <QuickAdd onClose={() => setQuick(false)} />}
    </div>
  )
}
