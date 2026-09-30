import { addDays, addMonths, dayDiff, endOfMonth, fmtDate, fmtMonth, startOfMonth, startOfWeek, today } from './dates'
import { money } from './format'
import type { Category, Transaction } from './types'

export type Period = { from: string; to: string }
export type PresetId = 'month' | 'last-month' | '3-months' | 'year' | 'custom'

export function presetPeriod(id: PresetId): Period {
  const t = today()
  switch (id) {
    case 'last-month': { const s = addMonths(startOfMonth(t), -1); return { from: s, to: endOfMonth(s) } }
    case '3-months': return { from: addMonths(startOfMonth(t), -2), to: endOfMonth(t) }
    case 'year': return { from: `${t.slice(0, 4)}-01-01`, to: `${t.slice(0, 4)}-12-31` }
    default: return { from: startOfMonth(t), to: endOfMonth(t) }
  }
}

export function periodLabel(p: Period) {
  if (p.from === startOfMonth(p.from) && p.to === endOfMonth(p.from)) return fmtMonth(p.from)
  return `${fmtDate(p.from)} – ${fmtDate(p.to)}`
}

export const inPeriod = (t: Transaction, p: Period) => t.occurred_on >= p.from && t.occurred_on <= p.to

export function totals(txs: Transaction[]) {
  let income = 0
  let expense = 0
  for (const t of txs) {
    if (t.kind === 'income') income += t.amount
    else expense += t.amount
  }
  return { income, expense, balance: income - expense, savingsRate: income > 0 ? (income - expense) / income : 0 }
}

export type Slice = { id: string; name: string; icon: string; value: number; share: number; color: string }

export const SLICE_COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)']
export const OTHER_COLOR = 'var(--c-other)'

/** Expense totals by category: top 6 in fixed palette order, the rest folded into "Other". */
export function byCategory(txs: Transaction[], cats: Map<string, Category>, kind: 'expense' | 'income' = 'expense'): Slice[] {
  const sums = new Map<string, number>()
  for (const t of txs) {
    if (t.kind !== kind) continue
    const k = t.category_id ?? 'none'
    sums.set(k, (sums.get(k) ?? 0) + t.amount)
  }
  const total = [...sums.values()].reduce((a, b) => a + b, 0)
  const rows = [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([id, value]) => {
    const c = cats.get(id)
    return { id, name: c?.name ?? 'ללא קטגוריה', icon: c?.icon ?? '•', value, share: total ? value / total : 0, color: '' }
  })
  const top = rows.slice(0, 6).map((r, i) => ({ ...r, color: SLICE_COLORS[i] }))
  const rest = rows.slice(6)
  if (rest.length) {
    const value = rest.reduce((a, r) => a + r.value, 0)
    top.push({ id: '__other', name: `אחר (${rest.length} קטגוריות)`, icon: '⋯', value, share: total ? value / total : 0, color: OTHER_COLOR })
  }
  return top
}

/** Income vs expense buckets: by day (<=2 weeks), week (<=4 months) or month. */
export function timeline(txs: Transaction[], p: Period) {
  const span = dayDiff(p.from, p.to)
  const unit: 'day' | 'week' | 'month' = span <= 14 ? 'day' : span <= 120 ? 'week' : 'month'
  const keyOf = (d: string) => unit === 'day' ? d : unit === 'week' ? startOfWeek(d) : startOfMonth(d)
  const buckets = new Map<string, { key: string; income: number; expense: number }>()
  for (let d = keyOf(p.from); d <= p.to; d = unit === 'day' ? addDays(d, 1) : unit === 'week' ? addDays(d, 7) : addMonths(d, 1)) {
    buckets.set(d, { key: d, income: 0, expense: 0 })
  }
  for (const t of txs) {
    const b = buckets.get(keyOf(t.occurred_on))
    if (b) b[t.kind] += t.amount
  }
  const label = (k: string) => {
    if (unit === 'month') return fmtMonth(k).replace(/ \d{4}$/, '')
    const [, m, d] = k.split('-')
    return `${Number(d)}.${Number(m)}`
  }
  return { unit, rows: [...buckets.values()].map((b) => ({ ...b, label: label(b.key) })) }
}

// ---------------- Rule-based savings insights ----------------
export type Insight = { icon: string; tone: 'info' | 'warn' | 'bad' | 'good'; title: string; text: string; saving?: number }

export function insights(all: Transaction[], cats: Map<string, Category>, goals: { savings: number | null; income: number | null }): Insight[] {
  const out: Insight[] = []
  const t = today()
  const monthStart = startOfMonth(t)
  const cur = all.filter((x) => x.occurred_on >= monthStart && x.occurred_on <= t)
  const curExp = cur.filter((x) => x.kind === 'expense')
  const { income, expense } = totals(cur)
  const daysInMonthTotal = dayDiff(monthStart, endOfMonth(t)) + 1
  const dayOfMonth = dayDiff(monthStart, t) + 1
  const daysLeft = daysInMonthTotal - dayOfMonth + 1

  // History: the 3 full months before this one
  const histFrom = addMonths(monthStart, -3)
  const hist = all.filter((x) => x.kind === 'expense' && x.occurred_on >= histFrom && x.occurred_on < monthStart)
  const histMonths = new Set(hist.map((x) => x.occurred_on.slice(0, 7))).size

  // 1) Categories trending above their average (projected to full month)
  if (histMonths >= 1) {
    const avg = new Map<string, number>()
    for (const x of hist) avg.set(x.category_id ?? 'none', (avg.get(x.category_id ?? 'none') ?? 0) + x.amount / histMonths)
    const now = new Map<string, number>()
    for (const x of curExp) now.set(x.category_id ?? 'none', (now.get(x.category_id ?? 'none') ?? 0) + x.amount)
    const progress = dayOfMonth / daysInMonthTotal
    for (const [id, spent] of now) {
      const a = avg.get(id) ?? 0
      if (a < 100) continue
      const projected = progress > 0.25 ? spent / progress : spent
      if (spent > a || projected > a * 1.25) {
        const c = cats.get(id)
        const over = Math.max(spent, projected) - a
        if (over < 100) continue
        out.push({
          icon: c?.icon ?? '📈', tone: spent > a ? 'bad' : 'warn',
          title: `${c?.name ?? 'קטגוריה'}: מעל הממוצע`,
          text: spent > a
            ? `כבר הוצאת החודש ${money(spent)}, לעומת ממוצע של ${money(a)} בחודש. כדאי לעצור כאן עד סוף החודש.`
            : `בקצב הנוכחי תגיע לכ-${money(projected)} (ממוצע: ${money(a)}). שמירה על הממוצע תחסוך כ-${money(over)}.`,
          saving: over,
        })
      }
    }
  }

  // 2) Many small purchases that add up
  const small = curExp.filter((x) => x.amount < 50)
  if (small.length >= 8) {
    const sum = small.reduce((a, x) => a + x.amount, 0)
    out.push({
      icon: '☕', tone: 'warn', title: 'הוצאות קטנות שמצטברות',
      text: `${small.length} רכישות קטנות (מתחת ל-₪50) הצטברו החודש ל-${money(sum)}. צמצום של שליש מהן יחסוך כ-${money(sum / 3)} בחודש.`,
      saving: sum / 3,
    })
  }

  // 3) Frequently visited merchants
  const merchants = new Map<string, { n: number; sum: number }>()
  for (const x of curExp) {
    const m = x.merchant?.trim()
    if (!m) continue
    const v = merchants.get(m) ?? { n: 0, sum: 0 }
    merchants.set(m, { n: v.n + 1, sum: v.sum + x.amount })
  }
  const topMerchant = [...merchants.entries()].filter(([, v]) => v.n >= 4).sort((a, b) => b[1].sum - a[1].sum)[0]
  if (topMerchant) {
    const [name, v] = topMerchant
    out.push({
      icon: '📍', tone: 'info', title: `${v.n} ביקורים ב${name}`,
      text: `הוצאת שם החודש ${money(v.sum)}. חצי מהביקורים יחסכו כ-${money(v.sum / 2)}.`,
      saving: v.sum / 2,
    })
  }

  // 4) Subscriptions: yearly cost perspective
  const subsCat = [...cats.values()].find((c) => c.kind === 'expense' && c.name.includes('מנוי'))
  if (subsCat) {
    const lastMonthFrom = addMonths(monthStart, -1)
    const recent = all.filter((x) => x.category_id === subsCat.id && x.occurred_on >= lastMonthFrom && x.occurred_on <= t)
    const monthly = recent.reduce((a, x) => a + x.amount, 0) / (recent.some((x) => x.occurred_on < monthStart) ? 2 : 1)
    if (monthly >= 50) {
      out.push({
        icon: '🔁', tone: 'info', title: 'מנויים',
        text: `המנויים עולים לך כ-${money(monthly)} בחודש, כלומר ${money(monthly * 12)} בשנה. כדאי לעבור עליהם ולבטל את מה שלא בשימוש.`,
      })
    }
  }

  // 5) One category dominates spending
  if (expense > 500) {
    const top = byCategory(cur, cats)[0]
    if (top && top.share > 0.4 && top.id !== '__other') {
      out.push({
        icon: top.icon, tone: 'info', title: `${Math.round(top.share * 100)}% מההוצאות: ${top.name}`,
        text: `קטגוריה אחת מהווה חלק גדול מההוצאות החודש. קיצוץ של 10% בה בלבד יחסוך כ-${money(top.value * 0.1)}.`,
        saving: top.value * 0.1,
      })
    }
  }

  // 6) Savings goal: remaining daily budget
  if (goals.savings && income > 0) {
    const allowed = income - goals.savings - expense
    if (allowed < 0) {
      out.push({
        icon: '🎯', tone: 'bad', title: 'יעד החיסכון בסכנה',
        text: `כדי לחסוך ${money(goals.savings)} החודש, ההוצאות כבר גבוהות ב-${money(-allowed)} ממה שמתאפשר לפי ההכנסות עד עכשיו.`,
      })
    } else {
      out.push({
        icon: '🎯', tone: 'good', title: 'בדרך ליעד החיסכון',
        text: `נשארו לך ${money(allowed)} להוצאות עד סוף החודש: בערך ${money(allowed / daysLeft)} ליום.`,
      })
    }
  }

  // 7) Spending more than earning
  if (income > 0 && expense > income) {
    out.push({
      icon: '⚠️', tone: 'bad', title: 'הוצאות גבוהות מההכנסות',
      text: `החודש יצאו ${money(expense - income)} יותר ממה שנכנס.`,
    })
  }

  // 8) Income goal progress
  if (goals.income) {
    const ratio = income / goals.income
    if (ratio >= 1) out.push({ icon: '💰', tone: 'good', title: 'עמדת ביעד ההכנסה!', text: `הכנסת ${money(income)} החודש, מעל היעד של ${money(goals.income)}.` })
  }

  const order = { bad: 0, warn: 1, info: 2, good: 3 }
  return out.sort((a, b) => order[a.tone] - order[b.tone] || (b.saving ?? 0) - (a.saving ?? 0))
}
