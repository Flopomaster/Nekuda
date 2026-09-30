import { useMemo, useState } from 'react'
import { useData } from '../hooks/useData'
import { today } from '../lib/dates'
import type { Kind, Transaction } from '../lib/types'
import { Confirm, Sheet } from './Sheet'
import { useToast } from './Toast'
import { IconTrash } from './Icons'

export function TransactionForm({ initial, defaultKind = 'expense', onClose }: {
  initial?: Transaction; defaultKind?: Kind; onClose: () => void
}) {
  const { categories, paymentMethods, transactions, saveTransaction, deleteTransaction } = useData()
  const toast = useToast()
  const [kind, setKind] = useState<Kind>(initial?.kind ?? defaultKind)
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState<string | null>(initial?.category_id ?? null)
  const [date, setDate] = useState(initial?.occurred_on ?? today())
  const [merchant, setMerchant] = useState(initial?.merchant ?? '')
  const [paymentId, setPaymentId] = useState<string | null>(initial?.payment_method_id ?? paymentMethods.find((p) => !p.archived)?.id ?? null)
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const cats = categories.filter((c) => c.kind === kind && (!c.archived || c.id === categoryId))

  // Past merchants, most frequent first, remembering their last category & payment method
  const merchantInfo = useMemo(() => {
    const m = new Map<string, { n: number; category_id: string | null; payment_method_id: string | null }>()
    for (const t of transactions) {
      const name = t.merchant?.trim()
      if (!name || t.kind !== kind) continue
      const v = m.get(name)
      if (v) v.n++
      else m.set(name, { n: 1, category_id: t.category_id, payment_method_id: t.payment_method_id })
    }
    return m
  }, [transactions, kind])
  const merchantNames = useMemo(() => [...merchantInfo.entries()].sort((a, b) => b[1].n - a[1].n).map(([k]) => k), [merchantInfo])

  const onMerchant = (v: string) => {
    setMerchant(v)
    const info = merchantInfo.get(v.trim())
    if (info && !initial) {
      if (!categoryId && info.category_id) setCategoryId(info.category_id)
      if (info.payment_method_id) setPaymentId(info.payment_method_id)
    }
  }

  const value = Number(amount.replace(/,/g, ''))
  const valid = value > 0 && !!categoryId && !!date

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const ok = await saveTransaction({
      ...(initial ? { id: initial.id } : {}),
      kind, amount: value, category_id: categoryId, occurred_on: date,
      merchant: merchant.trim() || null, payment_method_id: kind === 'expense' ? paymentId : null, note: note.trim() || null,
    })
    setSaving(false)
    if (ok) {
      toast(initial ? 'עודכן ✓' : kind === 'expense' ? 'ההוצאה נשמרה ✓' : 'ההכנסה נשמרה ✓')
      onClose()
    }
  }

  return (
    <Sheet title={initial ? 'עריכת תנועה' : kind === 'expense' ? 'הוצאה חדשה' : 'הכנסה חדשה'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <div className="segmented full expense">
          <button type="button" className={kind === 'expense' ? 'on' : ''} onClick={() => { setKind('expense'); setCategoryId(null) }}>הוצאה</button>
          <button type="button" className={`inc ${kind === 'income' ? 'on' : ''}`} onClick={() => { setKind('income'); setCategoryId(null) }}>הכנסה</button>
        </div>

        <label className="field" style={{ alignItems: 'center' }}>
          <span className="sr-only">סכום</span>
          <div className="row" style={{ justifyContent: 'center', gap: 4, direction: 'ltr' }}>
            <span style={{ fontSize: 28, color: 'var(--muted)', fontWeight: 600 }}>₪</span>
            <input
              className="input amount num" inputMode="decimal" placeholder="0" autoFocus={!initial}
              value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              style={{ width: `${Math.max(2, amount.length + 1)}ch`, color: kind === 'income' ? 'var(--success)' : undefined }}
            />
          </div>
        </label>

        <div className="field">
          <span>קטגוריה</span>
          <div className="chips">
            {cats.map((c) => (
              <button type="button" key={c.id} className={`chip ${categoryId === c.id ? 'on' : ''}`} onClick={() => setCategoryId(c.id)}>
                <span>{c.icon}</span>{c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-2" style={{ gap: 12 }}>
          <label className="field">
            <span>{kind === 'expense' ? 'איפה (שם העסק)' : 'מקור'}</span>
            <input className="input" list="merchants" value={merchant} onChange={(e) => onMerchant(e.target.value)} placeholder={kind === 'expense' ? 'למשל: שופרסל' : 'למשל: שם המעסיק'} />
            <datalist id="merchants">{merchantNames.slice(0, 50).map((m) => <option key={m} value={m} />)}</datalist>
          </label>
          <label className="field">
            <span>תאריך</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        {kind === 'expense' && (
          <div className="field">
            <span>אמצעי תשלום</span>
            <div className="chips">
              {paymentMethods.filter((p) => !p.archived || p.id === paymentId).map((p) => (
                <button type="button" key={p.id} className={`chip ${paymentId === p.id ? 'on' : ''}`} onClick={() => setPaymentId(p.id)}>{p.name}</button>
              ))}
            </div>
          </div>
        )}

        <label className="field">
          <span>הערה</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="לא חובה" />
        </label>

        <div className="row" style={{ marginTop: 4 }}>
          <button className="btn primary grow" disabled={!valid || saving}>{saving ? 'שומר…' : 'שמירה'}</button>
          {initial && <button type="button" className="btn danger" onClick={() => setConfirm(true)} aria-label="מחיקה"><IconTrash /></button>}
        </div>
        {!categoryId && value > 0 && <div className="xs muted" style={{ textAlign: 'center', marginTop: -8 }}>בחר קטגוריה כדי לשמור</div>}
      </form>
      {confirm && initial && (
        <Confirm text="התנועה תימחק לצמיתות." onClose={() => setConfirm(false)}
          onYes={async () => { await deleteTransaction(initial.id); toast('נמחק'); onClose() }} />
      )}
    </Sheet>
  )
}
