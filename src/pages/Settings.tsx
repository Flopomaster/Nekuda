import { useEffect, useState } from 'react'
import { BankSyncCard } from '../components/BankSync'
import { IconBell, IconLock, IconLogout, IconMoon, IconPlus, IconSun } from '../components/Icons'
import { useToast } from '../components/Toast'
import { useData } from '../hooks/useData'
import { useTheme, type ThemePref } from '../hooks/useTheme'
import { hhmm } from '../lib/dates'
import { bioSupported, clearLock, disableBio, enableBio, hasBio, hasPin } from '../lib/lock'
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported, sendTestPush } from '../lib/push'
import { supabase } from '../lib/supabase'
import type { Kind } from '../lib/types'
import { LockScreen } from './LockScreen'

const SWATCHES = ['#9b1c31', '#2a78d6', '#eda100', '#008300', '#4a3aa7', '#eb6834', '#c98b95', '#6b4f55']

export function SettingsPage({ email }: { email: string }) {
  return (
    <div className="fade-in">
      <div className="page-head"><div><h1>הגדרות</h1><div className="sub">{email}</div></div></div>
      <div className="grid grid-2">
        <div className="stack">
          <GoalsCard />
          <NotificationsCard />
          <SecurityCard email={email} />
          <AppearanceCard />
        </div>
        <div className="stack">
          <BankSyncCard />
          <CategoriesCard />
          <PaymentsCard />
          <TagsCard />
          <AccountCard />
        </div>
      </div>
    </div>
  )
}

function GoalsCard() {
  const { settings, saveSettings } = useData()
  const toast = useToast()
  const [savings, setSavings] = useState(settings?.savings_goal?.toString() ?? '')
  const [income, setIncome] = useState(settings?.income_goal?.toString() ?? '')
  const save = async () => {
    await saveSettings({ savings_goal: savings ? Number(savings) : null, income_goal: income ? Number(income) : null })
    toast('היעדים נשמרו ✓')
  }
  return (
    <div className="card stack">
      <h2 style={{ fontSize: 17 }}>🎯 יעדים חודשיים</h2>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <label className="field"><span>יעד חיסכון (₪)</span>
          <input className="input num" inputMode="numeric" value={savings} onChange={(e) => setSavings(e.target.value.replace(/\D/g, ''))} placeholder="למשל 2000" />
        </label>
        <label className="field"><span>יעד הכנסה (₪)</span>
          <input className="input num" inputMode="numeric" value={income} onChange={(e) => setIncome(e.target.value.replace(/\D/g, ''))} placeholder="למשל 15000" />
        </label>
      </div>
      <button className="btn primary" onClick={save}>שמירת יעדים</button>
    </div>
  )
}

function NotificationsCard() {
  const { settings, saveSettings } = useData()
  const toast = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const supported = pushSupported()
  const needsInstall = isIOS() && !isStandalone()

  useEffect(() => { void currentSubscription().then((s) => setEnabled(!!s)) }, [])

  const toggle = async () => {
    setBusy(true)
    try {
      if (enabled) { await disablePush(); setEnabled(false); toast('ההתראות כובו') }
      else { await enablePush(); setEnabled(true); toast('ההתראות הופעלו ✓') }
    } catch (e) {
      toast((e as Error).message === 'denied' ? 'ההרשאה נדחתה. אפשר לאשר בהגדרות המכשיר' : 'לא הצלחנו להפעיל התראות', 'error')
    }
    setBusy(false)
  }

  const test = async () => {
    try {
      const r = await sendTestPush()
      toast(r.devices ? 'נשלחה התראת בדיקה ✓' : 'אין מכשירים רשומים', r.devices ? 'info' : 'error')
    } catch { toast('השליחה נכשלה', 'error') }
  }

  return (
    <div className="card stack">
      <h2 style={{ fontSize: 17 }} className="row"><IconBell width={20} />התראות לטלפון</h2>
      {needsInstall ? (
        <div className="insight warn">
          <div className="ii">📲</div>
          <div><b>צריך להתקין את האפליקציה קודם</b>
            <p>באייפון, התראות עובדות רק מאפליקציה שמותקנת על מסך הבית: לחץ על כפתור השיתוף <b>⎋</b> בספארי ← <b>״הוספה למסך הבית״</b>, ואז פתח את נקודה מהאייקון וחזור לכאן.</p>
          </div>
        </div>
      ) : !supported ? (
        <div className="small muted">הדפדפן הזה לא תומך בהתראות.</div>
      ) : (
        <>
          <div className="row between">
            <div><div style={{ fontWeight: 500 }}>התראות במכשיר הזה</div><div className="xs muted">תזכורות למשימות + סיכום משימות באיחור</div></div>
            <button className={`btn sm ${enabled ? 'outline' : 'primary'}`} onClick={toggle} disabled={busy || enabled === null}>{enabled ? 'כיבוי' : 'הפעלה'}</button>
          </div>
          {enabled && <button className="btn sm ghost" onClick={test} style={{ alignSelf: 'flex-start' }}>שליחת התראת בדיקה</button>}
        </>
      )}
      <label className="field"><span>שעת תזכורת ערב למשימות באיחור</span>
        <input className="input" type="time" value={hhmm(settings?.evening_reminder_time ?? '20:00')}
          onChange={(e) => e.target.value && void saveSettings({ evening_reminder_time: e.target.value })} />
      </label>
    </div>
  )
}

function SecurityCard({ email }: { email: string }) {
  const toast = useToast()
  const [pinSet, setPinSet] = useState(hasPin())
  const [bio, setBio] = useState(hasBio())
  const [canBio, setCanBio] = useState(false)
  const [setup, setSetup] = useState(false)
  useEffect(() => { void bioSupported().then(setCanBio) }, [])

  if (setup) return <div style={{ position: 'fixed', inset: 0, zIndex: 90 }}><LockScreen mode="setup" onDone={() => { setSetup(false); setPinSet(true); toast('הקוד נשמר ✓') }} onSkip={() => setSetup(false)} /></div>

  return (
    <div className="card stack">
      <h2 style={{ fontSize: 17 }} className="row"><IconLock width={20} />אבטחה</h2>
      <div className="row between">
        <div><div style={{ fontWeight: 500 }}>קוד PIN</div><div className="xs muted">{pinSet ? 'נדרש בפתיחת האפליקציה' : 'לא מוגדר'}</div></div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm outline" onClick={() => setSetup(true)}>{pinSet ? 'שינוי' : 'הגדרה'}</button>
          {pinSet && <button className="btn sm ghost" onClick={() => { clearLock(); setPinSet(false); setBio(false); toast('הנעילה בוטלה') }}>ביטול</button>}
        </div>
      </div>
      {pinSet && canBio && (
        <div className="row between">
          <div><div style={{ fontWeight: 500 }}>Face ID / טביעת אצבע</div><div className="xs muted">פתיחה מהירה במקום הקוד</div></div>
          <button className={`btn sm ${bio ? 'outline' : 'primary'}`} onClick={async () => {
            if (bio) { disableBio(); setBio(false); return }
            try { await enableBio(email); setBio(true); toast('Face ID הופעל ✓') } catch { toast('לא הצלחנו להפעיל', 'error') }
          }}>{bio ? 'כיבוי' : 'הפעלה'}</button>
        </div>
      )}
      <div className="xs muted">הנעילה נשמרת במכשיר הזה בלבד ונדרשת גם אחרי דקה ברקע.</div>
    </div>
  )
}

function AppearanceCard() {
  const [pref, setPref] = useTheme()
  const opts: { id: ThemePref; label: string; icon?: React.ReactNode }[] = [
    { id: 'light', label: 'בהיר', icon: <IconSun width={16} /> },
    { id: 'dark', label: 'כהה', icon: <IconMoon width={16} /> },
    { id: 'system', label: 'לפי המכשיר' },
  ]
  return (
    <div className="card stack">
      <h2 style={{ fontSize: 17 }}>🎨 מראה</h2>
      <div className="segmented full">
        {opts.map((o) => <button key={o.id} className={pref === o.id ? 'on' : ''} onClick={() => setPref(o.id)}><span className="row" style={{ gap: 6, justifyContent: 'center' }}>{o.icon}{o.label}</span></button>)}
      </div>
    </div>
  )
}

function CategoriesCard() {
  const { categories, saveRow } = useData()
  const [kind, setKind] = useState<Kind>('expense')
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('')
  const list = categories.filter((c) => c.kind === kind)
  const add = async () => {
    if (!name.trim()) return
    await saveRow('categories', { kind, name: name.trim(), icon: icon.trim() || '•', sort: list.length + 1 })
    setName(''); setIcon('')
  }
  return (
    <div className="card stack">
      <div className="row between"><h2 style={{ fontSize: 17 }}>🗂️ קטגוריות</h2>
        <div className="segmented">
          <button className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>הוצאות</button>
          <button className={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>הכנסות</button>
        </div>
      </div>
      <div className="list">
        {list.map((c) => (
          <div key={c.id} className="list-item" style={{ opacity: c.archived ? 0.5 : 1 }}>
            <input className="input" style={{ width: 52, textAlign: 'center', padding: 8 }} defaultValue={c.icon} aria-label="אייקון"
              onBlur={(e) => e.target.value !== c.icon && void saveRow('categories', { id: c.id, icon: e.target.value || '•' })} />
            <input className="input grow" defaultValue={c.name} aria-label="שם"
              onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && void saveRow('categories', { id: c.id, name: e.target.value.trim() })} />
            <button className="btn sm ghost" onClick={() => void saveRow('categories', { id: c.id, archived: !c.archived })}>{c.archived ? 'שחזור' : 'הסתרה'}</button>
          </div>
        ))}
      </div>
      <div className="row">
        <input className="input" style={{ width: 52, textAlign: 'center', padding: 8 }} placeholder="😀" value={icon} onChange={(e) => setIcon(e.target.value)} aria-label="אייקון" />
        <input className="input grow" placeholder="קטגוריה חדשה" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <button className="icon-btn" onClick={add} aria-label="הוספה"><IconPlus /></button>
      </div>
    </div>
  )
}

function PaymentsCard() {
  const { paymentMethods, saveRow } = useData()
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    await saveRow('payment_methods', { name: name.trim(), sort: paymentMethods.length + 1 })
    setName('')
  }
  return (
    <div className="card stack">
      <h2 style={{ fontSize: 17 }}>💳 אמצעי תשלום</h2>
      <div className="list">
        {paymentMethods.map((p) => (
          <div key={p.id} className="list-item" style={{ opacity: p.archived ? 0.5 : 1 }}>
            <input className="input grow" defaultValue={p.name} aria-label="שם"
              onBlur={(e) => e.target.value.trim() && e.target.value !== p.name && void saveRow('payment_methods', { id: p.id, name: e.target.value.trim() })} />
            <button className="btn sm ghost" onClick={() => void saveRow('payment_methods', { id: p.id, archived: !p.archived })}>{p.archived ? 'שחזור' : 'הסתרה'}</button>
          </div>
        ))}
      </div>
      <div className="row">
        <input className="input grow" placeholder="למשל: ויזה כאל" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <button className="icon-btn" onClick={add} aria-label="הוספה"><IconPlus /></button>
      </div>
    </div>
  )
}

function TagsCard() {
  const { tags, saveRow } = useData()
  const [name, setName] = useState('')
  const add = async () => {
    if (!name.trim()) return
    await saveRow('task_tags', { name: name.trim(), color: SWATCHES[tags.length % SWATCHES.length], sort: tags.length + 1 })
    setName('')
  }
  return (
    <div className="card stack">
      <h2 style={{ fontSize: 17 }}>🏷️ קטגוריות משימות</h2>
      <div className="list">
        {tags.map((t) => (
          <div key={t.id} className="list-item">
            <div className="row" style={{ gap: 4 }}>
              {SWATCHES.map((c) => (
                <button key={c} aria-label={`צבע ${c}`} onClick={() => void saveRow('task_tags', { id: t.id, color: c })}
                  style={{ width: 18, height: 18, borderRadius: 6, background: c, border: t.color === c ? '2px solid var(--text)' : '2px solid transparent', padding: 0 }} />
              ))}
            </div>
            <input className="input grow" defaultValue={t.name} aria-label="שם"
              onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && void saveRow('task_tags', { id: t.id, name: e.target.value.trim() })} />
          </div>
        ))}
      </div>
      <div className="row">
        <input className="input grow" placeholder="קטגוריה חדשה" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <button className="icon-btn" onClick={add} aria-label="הוספה"><IconPlus /></button>
      </div>
    </div>
  )
}

function AccountCard() {
  const { transactions, tasks, categories } = useData()
  const backup = () => {
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), transactions, tasks, categories }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nekuda-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
  }
  return (
    <div className="card stack">
      <h2 style={{ fontSize: 17 }}>👤 חשבון</h2>
      <button className="btn outline" onClick={backup}>גיבוי כל הנתונים (JSON)</button>
      <button className="btn danger" onClick={() => { clearLock(); void supabase.auth.signOut() }}><IconLogout />התנתקות</button>
    </div>
  )
}
