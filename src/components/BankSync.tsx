import { useCallback, useEffect, useState } from 'react'
import { SUPABASE_URL } from '../config'
import { BANK_COMPANIES, FIELD_LABELS, companyById, type BankCompany } from '../lib/bankCompanies'
import { generateSyncKeys, packWorkerSecret, sealWithPublicKey } from '../lib/sealedBox'
import { supabase } from '../lib/supabase'
import { IconLock, IconPlus, IconTrash } from './Icons'
import { Confirm, Sheet } from './Sheet'
import { useToast } from './Toast'

type Conn = {
  id: string; company: string; label: string | null; status: 'pending' | 'ok' | 'error'; last_error: string | null
  last_sync_at: string | null; last_success_at: string | null; last_added: number | null; created_at: string
}

const GITHUB_SECRET_URL = 'https://github.com/Flopomaster/Nekuda/settings/secrets/actions/new'
const COLS = 'id, company, label, status, last_error, last_sync_at, last_success_at, last_added, created_at'

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 60) return `לפני ${Math.max(1, min)} דק׳`
  const h = Math.round(min / 60)
  if (h < 24) return `לפני ${h} שע׳`
  return `לפני ${Math.round(h / 24)} ימים`
}

export function BankSyncCard() {
  const toast = useToast()
  const [publicKey, setPublicKey] = useState<string | null | undefined>(undefined)
  const [conns, setConns] = useState<Conn[]>([])
  const [connect, setConnect] = useState<{ edit?: Conn } | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [del, setDel] = useState<Conn | null>(null)

  const load = useCallback(async () => {
    const [{ data: cfg }, { data: rows }] = await Promise.all([
      supabase.from('sync_config').select('public_key').maybeSingle(),
      supabase.from('bank_connections').select(COLS).order('created_at'),
    ])
    setPublicKey(cfg?.public_key ?? null)
    setConns((rows ?? []) as Conn[])
  }, [])
  useEffect(() => { void load() }, [load])

  async function setup() {
    try {
      const keys = await generateSyncKeys()
      const { error } = await supabase.rpc('setup_bank_sync', { p_public_key: keys.publicKey, p_token_hash: keys.tokenHash })
      if (error) throw error
      // The private key exists only in this browser tab until it is pasted into GitHub
      setSecret(packWorkerSecret(`${SUPABASE_URL}/functions/v1/bank-sync`, keys.token, keys.privateKey))
      await load()
    } catch (e) {
      console.error(e)
      toast('ההגדרה נכשלה', 'error')
    }
  }

  if (publicKey === undefined) return null

  return (
    <div className="card stack">
      <h2 style={{ fontSize: 17 }}>🏦 חיבור לבנק ולאשראי</h2>
      {publicKey === null ? (
        <>
          <p className="small text-2" style={{ margin: 0, lineHeight: 1.6 }}>
            עדכון אוטומטי של התנועות מהבנק ומכרטיס האשראי, כל לילה. לפני החיבור הראשון צריך הגדרה חד-פעמית של מפתח הצפנה.
          </p>
          <button className="btn primary" onClick={setup}><IconLock />הגדרה ראשונית (פעם אחת)</button>
        </>
      ) : (
        <>
          {conns.map((c) => {
            const company = companyById(c.company)
            return (
              <div key={c.id} className="bank-conn">
                <div className="grow" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.label || company?.name || c.company}</div>
                  {c.status === 'ok' && c.last_success_at && (
                    <div className="xs" style={{ color: 'var(--success)' }}>✓ עודכן {ago(c.last_success_at)}{c.last_added ? ` · ${c.last_added} תנועות חדשות` : ''}</div>
                  )}
                  {c.status === 'pending' && <div className="xs muted">⏳ יתעדכן בסנכרון הלילי הבא (בסביבות 04:00)</div>}
                  {c.status === 'error' && <div className="xs" style={{ color: 'var(--danger)' }}>⚠️ {c.last_error}</div>}
                </div>
                <button className="btn sm ghost" onClick={() => setConnect({ edit: c })}>עדכון פרטים</button>
                <button className="icon-btn" aria-label="ניתוק" onClick={() => setDel(c)}><IconTrash /></button>
              </div>
            )
          })}
          {!conns.length && <div className="small muted">עוד לא חיברת חשבון.</div>}
          <button className="btn outline" onClick={() => setConnect({})}><IconPlus />חיבור חשבון</button>
          <div className="xs muted" style={{ lineHeight: 1.6 }}>
            🔒 פרטי ההתחברות מוצפנים במכשיר שלך לפני השליחה, ורק תהליך הסנכרון הלילי יכול לפענח אותם. אף אחד, כולל מנהל המערכת, לא יכול לקרוא אותם.
            Pepper לא נתמך (אין לו אתר); אפשר לייבא ממנו קובץ.
          </div>
        </>
      )}

      {connect && publicKey && (
        <ConnectSheet publicKey={publicKey} edit={connect.edit} onClose={() => setConnect(null)} onSaved={load} />
      )}
      {secret && <SecretSheet secret={secret} onClose={() => setSecret(null)} />}
      {del && (
        <Confirm text={`החיבור ל${companyById(del.company)?.name ?? del.company} יימחק יחד עם פרטי ההתחברות. תנועות שכבר יובאו יישארו.`}
          onClose={() => setDel(null)}
          onYes={async () => {
            const { error } = await supabase.from('bank_connections').delete().eq('id', del.id)
            if (error) toast('המחיקה נכשלה', 'error')
            else { toast('החשבון נותק'); await load() }
          }} />
      )}
    </div>
  )
}

function ConnectSheet({ publicKey, edit, onClose, onSaved }: { publicKey: string; edit?: Conn; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [company, setCompany] = useState<BankCompany | undefined>(edit ? companyById(edit.company) : undefined)
  const [label, setLabel] = useState(edit?.label ?? '')
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const valid = !!company && company.fields.every((f) => values[f]?.trim())

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!company || !valid) return
    setBusy(true)
    try {
      const creds = Object.fromEntries(company.fields.map((f) => [f, values[f].trim()]))
      const encrypted_credentials = await sealWithPublicKey(publicKey, creds)
      const row = { company: company.id, label: label.trim() || null, encrypted_credentials, status: 'pending', last_error: null }
      const { error } = edit
        ? await supabase.from('bank_connections').update(row).eq('id', edit.id)
        : await supabase.from('bank_connections').insert(row)
      if (error) throw error
      setValues({}) // don't keep the password around
      toast(edit ? 'הפרטים עודכנו ✓' : 'החשבון חובר ✓')
      onSaved()
      onClose()
    } catch (err) {
      console.error(err)
      toast('השמירה נכשלה', 'error')
    }
    setBusy(false)
  }

  return (
    <Sheet title={edit ? 'עדכון פרטי התחברות' : 'חיבור חשבון'} onClose={onClose}>
      <form className="stack" onSubmit={save} autoComplete="off">
        {!edit && (
          <>
            <div className="field"><span>כרטיס אשראי</span>
              <div className="chips">{BANK_COMPANIES.filter((c) => c.kind === 'card').map((c) => (
                <button type="button" key={c.id} className={`chip ${company?.id === c.id ? 'on' : ''}`} onClick={() => { setCompany(c); setValues({}) }}>{c.name}</button>
              ))}</div>
            </div>
            <div className="field"><span>בנק</span>
              <div className="chips">{BANK_COMPANIES.filter((c) => c.kind === 'bank').map((c) => (
                <button type="button" key={c.id} className={`chip ${company?.id === c.id ? 'on' : ''}`} onClick={() => { setCompany(c); setValues({}) }}>{c.name}</button>
              ))}</div>
            </div>
          </>
        )}
        {company && (
          <>
            <div className="small text-2">פרטי הכניסה שלך ל<b>{company.name}</b>, כמו באתר שלהם:</div>
            {company.fields.map((f) => (
              <label key={f} className="field"><span>{FIELD_LABELS[f]}</span>
                <input className="input" dir="ltr" required
                  type={f === 'password' ? 'password' : 'text'}
                  inputMode={f === 'id' || f === 'nationalID' || f === 'card6Digits' ? 'numeric' : undefined}
                  autoComplete={f === 'password' ? 'new-password' : 'off'}
                  value={values[f] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))} />
              </label>
            ))}
            <label className="field"><span>כינוי (לא חובה)</span>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`למשל: ${company.kind === 'card' ? 'הכרטיס שלי' : 'עו״ש'}`} />
            </label>
            <div className="insight"><div className="ii">🔒</div><div><p style={{ marginTop: 0 }}>הפרטים מוצפנים כאן במכשיר לפני השליחה. העדכון הראשון יקרה בסנכרון הלילי הבא ויביא תנועות מ-3 החודשים האחרונים.</p></div></div>
          </>
        )}
        <button className="btn primary" disabled={!valid || busy}>{busy ? 'מצפין ושומר…' : edit ? 'עדכון' : 'חיבור'}</button>
      </form>
    </Sheet>
  )
}

function SecretSheet({ secret, onClose }: { secret: string; onClose: () => void }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); toast('הועתק ✓') } catch { toast('ההעתקה נכשלה, סמן והעתק ידנית', 'error') }
  }
  return (
    <Sheet title="שלב אחרון: שמירת המפתח ב-GitHub" onClose={() => { if (copied || confirm('המפתח לא יוצג שוב. לסגור בכל זאת?')) onClose() }}>
      <div className="stack">
        <div className="insight warn"><div className="ii">🔑</div><div><b>המפתח מוצג פעם אחת בלבד</b><p>הוא לא נשמר בשום מקום אחר. בלעדיו הסנכרון הלילי לא יוכל לפענח את פרטי ההתחברות.</p></div></div>
        <ol className="small" style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.9 }}>
          <li>לחץ <b>העתקת המפתח</b></li>
          <li>פתח את <a href={GITHUB_SECRET_URL} target="_blank" rel="noreferrer">עמוד הסודות של הריפו ב-GitHub</a></li>
          <li>בשדה <b>Name</b> כתוב: <code dir="ltr">NEKUDA_SYNC_SECRET</code></li>
          <li>בשדה <b>Secret</b> הדבק את המפתח</li>
          <li>לחץ <b>Add secret</b></li>
        </ol>
        <textarea className="textarea num" readOnly value={secret} rows={4} style={{ fontSize: 11, direction: 'ltr' }} onFocus={(e) => e.target.select()} />
        <button className="btn primary" onClick={copy}>{copied ? 'הועתק ✓' : 'העתקת המפתח'}</button>
        <button className="btn ghost" onClick={onClose} disabled={!copied}>שמרתי ב-GitHub, סיום</button>
      </div>
    </Sheet>
  )
}
