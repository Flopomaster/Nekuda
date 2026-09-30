import { forwardRef, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams } from 'react-router-dom'
import { Donut, IncomeExpenseBars, Legend } from '../components/Charts'
import { IconDownload, IconSearch, IconTable, IconChart } from '../components/Icons'
import { ImportSheet } from '../components/ImportSheet'
import { useToast } from '../components/Toast'
import { TransactionForm } from '../components/TransactionForm'
import { useData } from '../hooks/useData'
import { fmtDate, relativeDay, today } from '../lib/dates'
import { exportExcel, exportPDF, exportPNG } from '../lib/export'
import { byCategory, inPeriod, insights, periodLabel, presetPeriod, timeline, totals, type Period, type PresetId, type Slice } from '../lib/finance'
import { money, moneyExact, pct } from '../lib/format'
import type { Kind, Transaction } from '../lib/types'
import { GoalBar } from './Dashboard'

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'month', label: 'החודש' },
  { id: 'last-month', label: 'חודש שעבר' },
  { id: '3-months', label: '3 חודשים' },
  { id: 'year', label: 'השנה' },
  { id: 'custom', label: 'מותאם' },
]
type Tab = 'list' | 'reports' | 'insights'

export function Finance() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'list'
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p }, { replace: true })
  const [preset, setPreset] = useState<PresetId>('month')
  const [period, setPeriod] = useState<Period>(presetPeriod('month'))
  const { loading, transactions } = useData()
  const [importing, setImporting] = useState(false)
  const txs = useMemo(() => transactions.filter((t) => inPeriod(t, period)), [transactions, period])

  const choosePreset = (id: PresetId) => {
    setPreset(id)
    if (id !== 'custom') setPeriod(presetPeriod(id))
  }

  if (loading) return <div className="spinner" />

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1>כספים</h1>
          <div className="sub">{periodLabel(period)}</div>
        </div>
        <button className="btn outline" onClick={() => setImporting(true)}><IconDownload style={{ transform: 'rotate(180deg)' }} />ייבוא מהבנק</button>
      </div>
      {importing && <ImportSheet onClose={() => setImporting(false)} />}

      <div className="card" style={{ padding: 14, marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="chips">
            {PRESETS.map((p) => (
              <button key={p.id} className={`chip ${preset === p.id ? 'on' : ''}`} onClick={() => choosePreset(p.id)}>{p.label}</button>
            ))}
          </div>
          {preset === 'custom' && (
            <div className="row" style={{ gap: 8 }}>
              <input className="input" type="date" value={period.from} max={period.to} aria-label="מתאריך"
                onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, from: e.target.value }))} style={{ padding: '8px 10px' }} />
              <span className="muted">עד</span>
              <input className="input" type="date" value={period.to} min={period.from} aria-label="עד תאריך"
                onChange={(e) => e.target.value && setPeriod((p) => ({ ...p, to: e.target.value }))} style={{ padding: '8px 10px' }} />
            </div>
          )}
        </div>
      </div>

      <div className="tabs" role="tablist">
        <button className={tab === 'list' ? 'on' : ''} onClick={() => setTab('list')}>תנועות</button>
        <button className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>דוחות וייצוא</button>
        <button className={tab === 'insights' ? 'on' : ''} onClick={() => setTab('insights')}>יעדים והמלצות</button>
      </div>

      {tab === 'list' && <TransactionsTab txs={txs} />}
      {tab === 'reports' && <ReportsTab txs={txs} period={period} />}
      {tab === 'insights' && <InsightsTab />}
    </div>
  )
}

function SummaryTiles({ txs }: { txs: Transaction[] }) {
  const s = totals(txs)
  return (
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      <div className="card stat"><span className="k">הכנסות</span><span className="v num" style={{ color: 'var(--success)' }}>{money(s.income)}</span></div>
      <div className="card stat"><span className="k">הוצאות</span><span className="v num">{money(s.expense)}</span></div>
      <div className="card stat"><span className="k">מאזן</span><span className="v num" style={{ color: s.balance < 0 ? 'var(--danger)' : undefined }}>{money(s.balance)}</span></div>
      <div className="card stat"><span className="k">שיעור חיסכון</span><span className="v num">{s.income ? pct(s.savingsRate) : '—'}</span></div>
    </div>
  )
}

// ---------------- Transactions ----------------
function TransactionsTab({ txs }: { txs: Transaction[] }) {
  const { categories, categoryById, paymentById } = useData()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<Kind | 'all'>('all')
  const [cat, setCat] = useState<string>('')
  const [edit, setEdit] = useState<Transaction | null>(null)

  const filtered = txs.filter((t) =>
    (kind === 'all' || t.kind === kind) && (!cat || t.category_id === cat) &&
    (!q || [t.merchant, t.note, categoryById.get(t.category_id ?? '')?.name].some((s) => s?.includes(q))))

  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>()
    for (const t of filtered) m.set(t.occurred_on, [...(m.get(t.occurred_on) ?? []), t])
    return [...m.entries()]
  }, [filtered])

  return (
    <>
      <SummaryTiles txs={txs} />
      <div className="card">
        <div className="row wrap" style={{ gap: 10, marginBottom: 6 }}>
          <div className="row grow" style={{ position: 'relative', minWidth: 200 }}>
            <IconSearch style={{ position: 'absolute', insetInlineStart: 12, width: 18, color: 'var(--muted)' }} />
            <input className="input" placeholder="חיפוש עסק, הערה או קטגוריה" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingInlineStart: 38 }} />
          </div>
          <div className="segmented">
            <button className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>הכל</button>
            <button className={kind === 'expense' ? 'on' : ''} onClick={() => setKind('expense')}>הוצאות</button>
            <button className={kind === 'income' ? 'on' : ''} onClick={() => setKind('income')}>הכנסות</button>
          </div>
          <select className="select" style={{ width: 'auto' }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="סינון לפי קטגוריה">
            <option value="">כל הקטגוריות</option>
            {categories.filter((c) => kind === 'all' || c.kind === kind).map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}{kind === 'all' ? (c.kind === 'income' ? ' (הכנסה)' : '') : ''}</option>
            ))}
          </select>
        </div>

        {groups.map(([date, items]) => {
          const net = items.reduce((a, t) => a + (t.kind === 'income' ? t.amount : -t.amount), 0)
          return (
            <div key={date}>
              <div className="group-label"><span>{relativeDay(date)}{date !== today() ? ` · ${fmtDate(date)}` : ''}</span><span className="num">{money(net)}</span></div>
              <div className="list">
                {items.map((t) => {
                  const c = categoryById.get(t.category_id ?? '')
                  const pm = paymentById.get(t.payment_method_id ?? '')
                  return (
                    <div key={t.id} className="list-item clickable" onClick={() => setEdit(t)}>
                      <div className="avatar">{c?.icon ?? '•'}</div>
                      <div className="grow">
                        <div style={{ fontWeight: 500 }}>{t.merchant || c?.name || 'ללא שם'}</div>
                        <div className="xs muted">{[c?.name, pm?.name, t.note].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className={`num ${t.kind === 'income' ? 'amount-inc' : 'amount-exp'}`}>{t.kind === 'income' ? '+' : '−'}{moneyExact(t.amount)}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        {!filtered.length && <div className="empty"><div className="e-icon">🔍</div>אין תנועות בתקופה הזו{q || cat || kind !== 'all' ? ' שמתאימות לסינון' : ''}</div>}
      </div>
      {edit && <TransactionForm initial={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

// ---------------- Reports ----------------
function ReportsTab({ txs, period }: { txs: Transaction[]; period: Period }) {
  const { categoryById, paymentById } = useData()
  const toast = useToast()
  const [sel, setSel] = useState<string | null>(null)
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const [busy, setBusy] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)
  const [renderReport, setRenderReport] = useState(false)

  const exp = useMemo(() => byCategory(txs, categoryById, 'expense'), [txs, categoryById])
  const inc = useMemo(() => byCategory(txs, categoryById, 'income'), [txs, categoryById])
  const tl = useMemo(() => timeline(txs, period), [txs, period])
  const s = totals(txs)

  async function run(kind: 'pdf' | 'xlsx' | 'png') {
    setBusy(kind)
    try {
      if (kind === 'xlsx') await exportExcel(txs, period, categoryById, paymentById)
      else {
        setRenderReport(true)
        await new Promise((r) => setTimeout(r, 400)) // let charts lay out
        if (!reportRef.current) throw new Error('no report')
        if (kind === 'pdf') await exportPDF(reportRef.current, period)
        else await exportPNG(reportRef.current, period)
      }
      toast('הקובץ ירד ✓')
    } catch (e) {
      console.error(e)
      toast('הייצוא נכשל', 'error')
    } finally {
      setBusy(null)
      setRenderReport(false)
    }
  }

  const selectedTx = sel ? txs.filter((t) => t.kind === 'expense' && (sel === '__other' ? !exp.slice(0, 6).some((x) => x.id === (t.category_id ?? 'none')) : (t.category_id ?? 'none') === sel)) : []

  return (
    <>
      <SummaryTiles txs={txs} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row wrap between" style={{ gap: 10 }}>
          <div><b>ייצוא דוח מפורט</b><div className="xs muted">{periodLabel(period)} · {txs.length} תנועות</div></div>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn sm primary" onClick={() => run('pdf')} disabled={!!busy || !txs.length}><IconDownload />{busy === 'pdf' ? 'מכין…' : 'PDF'}</button>
            <button className="btn sm outline" onClick={() => run('xlsx')} disabled={!!busy || !txs.length}><IconDownload />{busy === 'xlsx' ? 'מכין…' : 'Excel'}</button>
            <button className="btn sm outline" onClick={() => run('png')} disabled={!!busy || !txs.length}><IconDownload />{busy === 'png' ? 'מכין…' : 'תמונה'}</button>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card span-2">
          <div className="card-head">
            <h2>פילוח הוצאות</h2>
            <div className="segmented">
              <button className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')} aria-label="תרשים"><IconChart width={16} height={16} /></button>
              <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')} aria-label="טבלה"><IconTable width={16} height={16} /></button>
            </div>
          </div>
          {!exp.length ? <div className="empty"><div className="e-icon">📊</div>אין הוצאות בתקופה</div>
            : view === 'chart' ? (
              <div className="pie-layout">
                <Donut slices={exp} total={s.expense} selected={sel} onSelect={setSel} />
                <Legend slices={exp} selected={sel} onSelect={setSel} />
              </div>
            ) : <SliceTable slices={fullSlices(txs, categoryById)} />}
          {sel && (
            <div style={{ marginTop: 14 }}>
              <div className="group-label"><span>התנועות בקטגוריה</span><button className="btn ghost sm" onClick={() => setSel(null)}>ניקוי</button></div>
              <div className="list">
                {selectedTx.map((t) => (
                  <div key={t.id} className="list-item">
                    <div className="grow"><div>{t.merchant || categoryById.get(t.category_id ?? '')?.name}</div><div className="xs muted">{fmtDate(t.occurred_on)}{t.note ? ` · ${t.note}` : ''}</div></div>
                    <div className="num amount-exp">{moneyExact(t.amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card span-2">
          <div className="card-head"><h2>הכנסות מול הוצאות</h2><span className="xs muted">לפי {tl.unit === 'day' ? 'יום' : tl.unit === 'week' ? 'שבוע' : 'חודש'}</span></div>
          <IncomeExpenseBars rows={tl.rows} />
        </div>

        {inc.length > 0 && (
          <div className="card span-2">
            <div className="card-head"><h2>מקורות הכנסה</h2></div>
            <div className="pie-layout">
              <Donut slices={inc} total={s.income} label="סה״כ הכנסות" />
              <Legend slices={inc} />
            </div>
          </div>
        )}
      </div>

      {renderReport && createPortal(
        <div className="report-host" aria-hidden>
          <ReportView ref={reportRef} txs={txs} period={period} />
        </div>, document.body)}
    </>
  )
}

function fullSlices(txs: Transaction[], cats: ReturnType<typeof useData>['categoryById']): Slice[] {
  // Table view lists every category (no "Other" folding)
  const sums = new Map<string, number>()
  for (const t of txs) if (t.kind === 'expense') sums.set(t.category_id ?? 'none', (sums.get(t.category_id ?? 'none') ?? 0) + t.amount)
  const total = [...sums.values()].reduce((a, b) => a + b, 0)
  return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([id, value]) => ({
    id, value, share: total ? value / total : 0, name: cats.get(id)?.name ?? 'ללא קטגוריה', icon: cats.get(id)?.icon ?? '•', color: '',
  }))
}

function SliceTable({ slices }: { slices: Slice[] }) {
  return (
    <table className="data">
      <thead><tr><th>קטגוריה</th><th style={{ textAlign: 'end' }}>סכום</th><th style={{ textAlign: 'end' }}>אחוז</th></tr></thead>
      <tbody>
        {slices.map((s) => <tr key={s.id}><td>{s.icon} {s.name}</td><td className="n num">{moneyExact(s.value)}</td><td className="n num">{pct(s.share)}</td></tr>)}
      </tbody>
    </table>
  )
}

/** Print-ready report (always light) captured for PDF / PNG export. */
const ReportView = forwardRef<HTMLDivElement, { txs: Transaction[]; period: Period }>(({ txs, period }, ref) => {
  const { categoryById, paymentById } = useData()
  const s = totals(txs)
  const exp = byCategory(txs, categoryById, 'expense')
  const inc = byCategory(txs, categoryById, 'income')
  const tl = timeline(txs, period)
  const sorted = [...txs].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))
  return (
    <div className="report" ref={ref}>
      <div className="report-top">
        <div>
          <h1>דוח כספי</h1>
          <div style={{ color: 'var(--text-2)', marginTop: 4 }}>{periodLabel(period)} · {fmtDate(period.from)} – {fmtDate(period.to)}</div>
        </div>
        <img src="/icon-192.png" alt="" style={{ width: 56, height: 56, borderRadius: 14 }} />
      </div>
      <div className="report-kpis">
        <div><div className="xs text-2">הכנסות</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>{money(s.income)}</div></div>
        <div><div className="xs text-2">הוצאות</div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{money(s.expense)}</div></div>
        <div><div className="xs text-2">מאזן</div><div className="num" style={{ fontSize: 22, fontWeight: 700, color: s.balance < 0 ? 'var(--danger)' : undefined }}>{money(s.balance)}</div></div>
        <div><div className="xs text-2">שיעור חיסכון</div><div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{s.income ? pct(s.savingsRate) : '—'}</div></div>
      </div>

      {exp.length > 0 && (<>
        <h2>פילוח הוצאות לפי קטגוריה</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, alignItems: 'center' }}>
          <Donut slices={exp} total={s.expense} animate={false} size={250} />
          <Legend slices={exp} />
        </div>
      </>)}

      <h2>הכנסות מול הוצאות</h2>
      <IncomeExpenseBars rows={tl.rows} animate={false} height={220} />

      {inc.length > 0 && (<>
        <h2>מקורות הכנסה</h2>
        <table className="data">
          <tbody>{inc.map((r) => <tr key={r.id}><td>{r.icon} {r.name}</td><td className="n num">{moneyExact(r.value)}</td><td className="n num">{pct(r.share)}</td></tr>)}</tbody>
        </table>
      </>)}

      <h2>פירוט כל התנועות ({txs.length})</h2>
      <table className="data">
        <thead><tr><th>תאריך</th><th>קטגוריה</th><th>עסק / מקור</th><th>אמצעי תשלום</th><th>הערה</th><th style={{ textAlign: 'end' }}>סכום</th></tr></thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.id}>
              <td className="num">{fmtDate(t.occurred_on)}</td>
              <td>{categoryById.get(t.category_id ?? '')?.name ?? ''}</td>
              <td>{t.merchant ?? ''}</td>
              <td>{paymentById.get(t.payment_method_id ?? '')?.name ?? ''}</td>
              <td style={{ color: 'var(--text-2)' }}>{t.note ?? ''}</td>
              <td className="n num" style={{ color: t.kind === 'income' ? 'var(--success)' : undefined, fontWeight: 600 }}>{t.kind === 'income' ? '+' : '−'}{moneyExact(t.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="xs" style={{ color: 'var(--muted)', marginTop: 24, textAlign: 'center' }}>הופק מאפליקציית נקודה · {fmtDate(today())}</div>
    </div>
  )
})

// ---------------- Goals & insights ----------------
function InsightsTab() {
  const { transactions, categoryById, settings } = useData()
  const t = today()
  const month = presetPeriod('month')
  const s = totals(transactions.filter((x) => inPeriod(x, { from: month.from, to: t })))
  const tips = useMemo(() => insights(transactions, categoryById, { savings: settings?.savings_goal ?? null, income: settings?.income_goal ?? null }),
    [transactions, categoryById, settings])
  const potential = tips.reduce((a, x) => a + (x.saving ?? 0), 0)

  return (
    <div className="grid grid-3">
      <div className="card stack">
        <h2 style={{ fontSize: 17 }}>יעדים לחודש הנוכחי</h2>
        {settings?.savings_goal ? <GoalBar label="חיסכון (הכנסות פחות הוצאות)" value={s.balance} goal={settings.savings_goal} /> : null}
        {settings?.income_goal ? <GoalBar label="יעד הכנסה" value={s.income} goal={settings.income_goal} /> : null}
        {!settings?.savings_goal && !settings?.income_goal && <div className="small muted">אפשר להגדיר יעד חיסכון ויעד הכנסה חודשיים במסך ההגדרות.</div>}
        {potential > 0 && (
          <div className="insight good"><div className="ii">💡</div><div><b>פוטנציאל חיסכון</b><p>לפי ההמלצות אפשר לחסוך עד כ-<b className="num">{money(potential)}</b> בחודש.</p></div></div>
        )}
      </div>
      <div className="card span-2">
        <div className="card-head"><h2>המלצות לחיסכון</h2></div>
        <div className="stack" style={{ gap: 10 }}>
          {tips.map((tip, i) => (
            <div key={i} className={`insight ${tip.tone}`}>
              <div className="ii">{tip.icon}</div>
              <div><b>{tip.title}</b><p>{tip.text}</p></div>
            </div>
          ))}
          {!tips.length && <div className="empty"><div className="e-icon">✨</div>אין כרגע המלצות. ההמלצות מבוססות על השוואה לחודשים קודמים, אז הן ישתפרו עם הזמן.</div>}
        </div>
      </div>
    </div>
  )
}
