import { useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { classify, parseStatement, type ImportRow } from '../lib/bankImport'
import { fmtDate } from '../lib/dates'
import { money, moneyExact } from '../lib/format'
import type { Kind } from '../lib/types'
import { IconDownload } from './Icons'
import { Sheet } from './Sheet'
import { useToast } from './Toast'

type Filter = 'in' | 'review' | 'out'

const FLAG_LABEL: Record<NonNullable<ImportRow['flag']>, string> = {
  duplicate: 'כבר קיים',
  internal: 'העברה בין החשבונות שלך',
  'card-bill': 'חיוב אשראי',
}

export function ImportSheet({ onClose }: { onClose: () => void }) {
  const { categories, paymentMethods, transactions, importTransactions } = useData()
  const toast = useToast()
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<Filter>('in')

  const otherIds = useMemo(() => new Set(categories.filter((c) => c.name === 'אחר').map((c) => c.id)), [categories])

  async function onFile(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const { rows: raw, source, owner } = await parseStatement(file)
      if (!raw.length) throw new Error('לא נמצאו תנועות בקובץ')
      setRows(classify(raw, source, categories, transactions, paymentMethods, owner))
      setFileName(file.name)
    } catch (e) {
      setError((e as Error).message || 'לא הצלחנו לקרוא את הקובץ')
    }
    setBusy(false)
  }

  const update = (key: string, patch: Partial<ImportRow>) =>
    setRows((rs) => rs!.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  // Choosing a category applies to every row from the same merchant
  const setCategory = (row: ImportRow, categoryId: string) => {
    const same = (r: ImportRow) => r.key === row.key || (r.merchant === row.merchant && r.kind === row.kind && !r.flag)
    const n = rows!.filter(same).length
    setRows((rs) => rs!.map((r) => (same(r) ? { ...r, categoryId } : r)))
    if (n > 1) toast(`עודכן ל-${n} תנועות מ״${row.merchant}״`)
  }

  if (!rows) {
    return (
      <Sheet title="ייבוא תנועות מהבנק" onClose={onClose}>
        <div className="stack">
          <label className="dropzone">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => void onFile(e.target.files?.[0])} disabled={busy} />
            <IconDownload style={{ width: 30, height: 30, transform: 'rotate(180deg)', color: 'var(--primary)' }} />
            <b>{busy ? 'קורא את הקובץ…' : 'בחירת קובץ תנועות'}</b>
            <span className="small muted">Excel או CSV מהבנק או מחברת האשראי</span>
          </label>
          {error && <div className="insight bad"><div className="ii">⚠️</div><div><b>שגיאה</b><p>{error}</p></div></div>}
          <div className="small text-2" style={{ lineHeight: 1.6 }}>
            <b>טיפ:</b> מורידים מאפליקציית הבנק דוח תנועות ל-Excel ומעלים אותו כאן. אפשר לייבא שוב ושוב את אותה תקופה: תנועות שכבר יובאו מזוהות ולא נוספות פעמיים.
          </div>
        </div>
      </Sheet>
    )
  }

  const included = rows.filter((r) => r.include)
  // Expenses still in "אחר" (card charges without a merchant can't be categorized, so they're skipped)
  const review = rows.filter((r) => r.include && !r.flag && r.kind === 'expense' && r.categoryId && otherIds.has(r.categoryId))
  const excluded = rows.filter((r) => !r.include)
  const cardBills = rows.filter((r) => r.flag === 'card-bill')
  const sum = (kind: Kind) => included.filter((r) => r.kind === kind).reduce((a, r) => a + r.amount, 0)
  const shown = filter === 'in' ? included : filter === 'review' ? review : excluded

  async function submit() {
    setBusy(true)
    const added = await importTransactions(included.map((r) => ({
      kind: r.kind, amount: r.amount, occurred_on: r.date, merchant: r.merchant, category_id: r.categoryId,
      payment_method_id: r.paymentMethodId, note: r.note, external_id: r.key,
    })))
    setBusy(false)
    if (added !== null) {
      toast(added ? `יובאו ${added} תנועות ✓` : 'כל התנועות כבר היו קיימות')
      onClose()
    }
  }

  return (
    <Sheet title="בדיקה לפני ייבוא" onClose={onClose} wide>
      <div className="stack" style={{ gap: 14 }}>
        <div className="xs muted">{fileName} · {rows.length} שורות</div>
        <div className="import-stats">
          <div className="card stat" style={{ padding: 14 }}><span className="k">הכנסות לייבוא</span><span className="v num" style={{ fontSize: 20, color: 'var(--success)' }}>{money(sum('income'))}</span></div>
          <div className="card stat" style={{ padding: 14 }}><span className="k">הוצאות לייבוא</span><span className="v num" style={{ fontSize: 20 }}>{money(sum('expense'))}</span></div>
          <div className="card stat" style={{ padding: 14 }}><span className="k">לא ייובאו</span><span className="v num" style={{ fontSize: 20 }}>{excluded.length}</span><span className="d">כפולות והעברות פנימיות</span></div>
        </div>

        {cardBills.length > 0 && (
          <label className="insight warn" style={{ cursor: 'pointer' }}>
            <div className="ii">💳</div>
            <div className="grow">
              <b>{cardBills.length} חיובי כרטיס אשראי בלי פירוט ({money(cardBills.reduce((a, r) => a + r.amount, 0))})</b>
              <p>בקובץ של הבנק אין שם העסק לחיובים האלה. אם תייבא בנפרד את הפירוט מחברת האשראי, כדאי לא לכלול אותם כאן כדי שלא ייספרו פעמיים.</p>
            </div>
            <input type="checkbox" checked={cardBills.every((r) => r.include)} style={{ width: 20, height: 20, accentColor: 'var(--primary)', flexShrink: 0 }}
              onChange={(e) => setRows((rs) => rs!.map((r) => (r.flag === 'card-bill' ? { ...r, include: e.target.checked } : r)))} aria-label="לכלול חיובי אשראי" />
          </label>
        )}

        <div className="segmented full">
          <button className={filter === 'in' ? 'on' : ''} onClick={() => setFilter('in')}>לייבוא ({included.length})</button>
          <button className={filter === 'review' ? 'on' : ''} onClick={() => setFilter('review')}>ללא קטגוריה ({review.length})</button>
          <button className={filter === 'out' ? 'on' : ''} onClick={() => setFilter('out')}>לא ייובאו ({excluded.length})</button>
        </div>
        {filter === 'review' && review.length > 0 && <div className="xs muted">בחירת קטגוריה לעסק מעדכנת את כל התנועות שלו, והאפליקציה תזכור אותה לייבוא הבא.</div>}

        <div className="list import-list">
          {shown.map((r) => (
            <div key={r.key} className="import-row" style={{ opacity: r.include ? 1 : 0.55 }}>
              <input type="checkbox" checked={r.include} onChange={(e) => update(r.key, { include: e.target.checked })} aria-label="לכלול" />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="nm">{r.merchant}</div>
                <div className="xs muted">{fmtDate(r.date)}{r.flag && <span className="tag" style={{ marginInlineStart: 6 }}>{FLAG_LABEL[r.flag]}</span>}</div>
              </div>
              <select className="select" value={r.categoryId ?? ''} onChange={(e) => setCategory(r, e.target.value)} aria-label="קטגוריה">
                {categories.filter((c) => c.kind === r.kind && (!c.archived || c.id === r.categoryId)).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
              <div className={`num amt ${r.kind === 'income' ? 'amount-inc' : 'amount-exp'}`}>{r.kind === 'income' ? '+' : '−'}{moneyExact(r.amount)}</div>
            </div>
          ))}
          {!shown.length && <div className="empty small">{filter === 'review' ? 'לכל התנועות יש קטגוריה 🎉' : 'אין תנועות כאן'}</div>}
        </div>

        <div className="import-footer">
          <button className="btn primary block" onClick={submit} disabled={busy || !included.length}>
            {busy ? 'מייבא…' : `ייבוא ${included.length} תנועות`}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
