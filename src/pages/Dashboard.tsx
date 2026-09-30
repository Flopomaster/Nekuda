import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Donut, Legend } from '../components/Charts'
import { TaskForm } from '../components/TaskForm'
import { TaskItem } from '../components/TaskItem'
import { TransactionForm } from '../components/TransactionForm'
import { useData } from '../hooks/useData'
import { endOfMonth, fmtDayLong, fmtMonth, relativeDay, startOfMonth, today } from '../lib/dates'
import { byCategory, inPeriod, insights, totals } from '../lib/finance'
import { money, pct } from '../lib/format'
import { entriesFor, pastOverdue } from '../lib/taskView'
import type { Task, Transaction } from '../lib/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'לילה טוב'
  if (h < 12) return 'בוקר טוב'
  if (h < 17) return 'צהריים טובים'
  if (h < 21) return 'ערב טוב'
  return 'לילה טוב'
}

export function GoalBar({ label, value, goal, invert }: { label: string; value: number; goal: number; invert?: boolean }) {
  const ratio = goal > 0 ? Math.max(0, value) / goal : 0
  const tone = invert ? (ratio > 1 ? 'bad' : ratio > 0.85 ? 'warn' : 'good') : ratio >= 1 ? 'good' : ratio >= 0.5 ? '' : 'warn'
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between small">
        <span className="text-2">{label}</span>
        <span className="num"><b>{money(value)}</b> <span className="muted">/ {money(goal)}</span></span>
      </div>
      <div className={`progress ${tone}`} role="progressbar" aria-valuenow={Math.round(ratio * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className="xs muted">{ratio >= 1 ? 'הושג 🎉' : `${pct(ratio)} מהיעד`}</div>
    </div>
  )
}

export function Dashboard() {
  const { loading, transactions, tasks, completions, categoryById, settings } = useData()
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editTx, setEditTx] = useState<Transaction | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const t = today()

  const month = useMemo(() => ({ from: startOfMonth(t), to: endOfMonth(t) }), [t])
  const monthTx = useMemo(() => transactions.filter((x) => inPeriod(x, month)), [transactions, month])
  const sum = totals(monthTx)
  const slices = useMemo(() => byCategory(monthTx, categoryById), [monthTx, categoryById])
  const tips = useMemo(() => insights(transactions, categoryById, { savings: settings?.savings_goal ?? null, income: settings?.income_goal ?? null }),
    [transactions, categoryById, settings])

  const todays = entriesFor(tasks, completions, t)
  const overdue = pastOverdue(tasks, completions)
  const doneCount = todays.filter((e) => e.done).length

  if (loading) return <div className="spinner" />

  return (
    <div className="fade-in">
      <div className="page-head">
        <div>
          <h1>{greeting()} 👋</h1>
          <div className="sub">{fmtDayLong(t)}</div>
        </div>
      </div>

      <div className="grid grid-3">
        <div className="hero span-2">
          <div className="label">מאזן {fmtMonth(t)}</div>
          <div className="big num">{money(sum.balance)}</div>
          <div className="label">{sum.income > 0 ? `חסכת ${pct(Math.max(0, sum.savingsRate))} מההכנסות` : 'עדיין אין הכנסות החודש'}</div>
          <div className="hero-row">
            <div className="hero-pill"><div className="k">הכנסות</div><div className="v num">{money(sum.income)}</div></div>
            <div className="hero-pill"><div className="k">הוצאות</div><div className="v num">{money(sum.expense)}</div></div>
          </div>
        </div>

        <div className="card stack">
          <div className="card-head" style={{ marginBottom: 0 }}><h2>יעדים החודש</h2><Link className="link" to="/settings">עריכה</Link></div>
          {settings?.savings_goal ? <GoalBar label="חיסכון" value={sum.balance} goal={settings.savings_goal} /> : null}
          {settings?.income_goal ? <GoalBar label="הכנסה" value={sum.income} goal={settings.income_goal} /> : null}
          {!settings?.savings_goal && !settings?.income_goal && (
            <div className="empty" style={{ padding: 10 }}>
              <div className="e-icon">🎯</div>
              <div className="small">עוד לא הגדרת יעדים</div>
              <Link to="/settings" className="btn sm outline" style={{ marginTop: 10 }}>הגדרת יעדים</Link>
            </div>
          )}
        </div>

        <div className="card span-2">
          <div className="card-head">
            <h2>המשימות להיום</h2>
            <span className="small muted num">{doneCount}/{todays.length}</span>
          </div>
          {todays.length > 0 && <div className="progress good" style={{ height: 6, marginBottom: 6 }}><div style={{ width: `${(doneCount / todays.length) * 100}%` }} /></div>}
          {overdue.map((e) => <TaskItem key={`${e.task.id}:${e.date}`} entry={e} onEdit={() => setEditTask(e.task)} />)}
          {todays.map((e) => <TaskItem key={`${e.task.id}:${e.date}`} entry={e} onEdit={() => setEditTask(e.task)} />)}
          {!todays.length && !overdue.length && (
            <div className="empty"><div className="e-icon">🌿</div>אין משימות להיום. יום רגוע!</div>
          )}
          <Link to="/tasks" className="link small" style={{ display: 'inline-block', marginTop: 8 }}>לכל המשימות ←</Link>
        </div>

        <div className="card">
          <div className="card-head"><h2>לאן הלך הכסף</h2><Link className="link" to="/finance?tab=reports">לדוח</Link></div>
          {slices.length ? (
            <>
              <Donut slices={slices} total={sum.expense} selected={sel} onSelect={setSel} size={200} />
              <div style={{ marginTop: 12 }}><Legend slices={slices.slice(0, 4)} selected={sel} onSelect={setSel} /></div>
            </>
          ) : <div className="empty"><div className="e-icon">📊</div>הוסף הוצאה ראשונה כדי לראות פילוח</div>}
        </div>

        <div className="card span-2">
          <div className="card-head"><h2>תנועות אחרונות</h2><Link className="link" to="/finance">הכל</Link></div>
          <div className="list">
            {transactions.slice(0, 6).map((x) => {
              const c = x.category_id ? categoryById.get(x.category_id) : null
              return (
                <div key={x.id} className="list-item clickable" onClick={() => setEditTx(x)}>
                  <div className="avatar">{c?.icon ?? '•'}</div>
                  <div className="grow">
                    <div style={{ fontWeight: 500 }}>{x.merchant || c?.name || 'ללא שם'}</div>
                    <div className="xs muted">{c?.name} · {relativeDay(x.occurred_on)}</div>
                  </div>
                  <div className={`num ${x.kind === 'income' ? 'amount-inc' : 'amount-exp'}`}>{x.kind === 'income' ? '+' : '−'}{money(x.amount)}</div>
                </div>
              )
            })}
            {!transactions.length && <div className="empty"><div className="e-icon">💳</div>עוד אין תנועות. לחץ על + כדי להתחיל</div>}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>המלצות</h2><Link className="link" to="/finance?tab=insights">עוד</Link></div>
          <div className="stack" style={{ gap: 10 }}>
            {tips.slice(0, 2).map((tip, i) => (
              <div key={i} className={`insight ${tip.tone}`}>
                <div className="ii">{tip.icon}</div>
                <div><b>{tip.title}</b><p>{tip.text}</p></div>
              </div>
            ))}
            {!tips.length && <div className="empty small">ההמלצות יופיעו אחרי שיצטברו כמה תנועות</div>}
          </div>
        </div>
      </div>

      {editTask && <TaskForm initial={editTask} onClose={() => setEditTask(null)} />}
      {editTx && <TransactionForm initial={editTx} onClose={() => setEditTx(null)} />}
    </div>
  )
}
