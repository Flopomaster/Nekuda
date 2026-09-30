import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMsg({ text: error.message.includes('confirm') ? 'צריך לאשר את כתובת המייל (בדוק את תיבת הדואר)' : 'אימייל או סיסמה שגויים', error: true })
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
      if (error) setMsg({ text: error.message.includes('Database error') ? 'ההרשמה סגורה: הגעתם למספר המשתמשים המרבי' : error.message, error: true })
      else if (!data.session) setMsg({ text: 'נשלח אליך מייל אימות. אחרי האישור אפשר להתחבר.' })
    }
    setBusy(false)
  }

  return (
    <div className="center-screen">
      <form className="auth-card stack" onSubmit={submit}>
        <div>
          <img className="auth-logo" src="/icon-192.png" alt="" />
          <h1>נקודה</h1>
          <p className="text-2" style={{ textAlign: 'center', margin: '6px 0 0' }}>הכסף והמשימות שלך, במקום אחד</p>
        </div>
        <label className="field"><span>אימייל</span>
          <input className="input" type="email" autoComplete="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label className="field"><span>סיסמה</span>
          <input className="input" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} dir="ltr" minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {msg && <div className="small" style={{ color: msg.error ? 'var(--danger)' : 'var(--success)' }}>{msg.text}</div>}
        <button className="btn primary block" disabled={busy}>{busy ? '…' : mode === 'signin' ? 'כניסה' : 'יצירת חשבון'}</button>
        <button type="button" className="btn ghost block small" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null) }}>
          {mode === 'signin' ? 'פעם ראשונה? יצירת חשבון' : 'כבר יש לי חשבון'}
        </button>
      </form>
    </div>
  )
}
