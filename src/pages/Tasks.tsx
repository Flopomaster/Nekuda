import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RateBars } from '../components/Charts'
import { IconChevronLeft, IconChevronRight, IconPlus } from '../components/Icons'
import { TaskForm } from '../components/TaskForm'
import { TaskItem } from '../components/TaskItem'
import { useData } from '../hooks/useData'
import {
  addDays, addMonths, endOfMonth, fmtDayLong, fmtMonth, fromISO, hhmm, MONTHS, startOfMonth, startOfWeek, today, WEEKDAYS_SHORT,
} from '../lib/dates'
import { pct } from '../lib/format'
import { completionRate, isDone, occursOn, recurrenceLabel, streak } from '../lib/recurrence'
import { entriesFor, pastOverdue } from '../lib/taskView'
import type { Task } from '../lib/types'

type Tab = 'today' | 'calendar' | 'all' | 'progress'

export function Tasks() {
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'today'
  const setTab = (t: Tab) => setParams((p) => { p.set('tab', t); return p }, { replace: true })
  const { loading } = useData()
  const [form, setForm] = useState<{ task?: Task; date?: string } | null>(null)

  if (loading) return <div className="spinner" />

  return (
    <div className="fade-in">
      <div className="page-head">
        <div><h1>משימות</h1><div className="sub">{fmtDayLong(today())}</div></div>
        <button className="btn primary" onClick={() => setForm({})}><IconPlus />משימה חדשה</button>
      </div>
      <div className="tabs" role="tablist">
        <button className={tab === 'today' ? 'on' : ''} onClick={() => setTab('today')}>היום</button>
        <button className={tab === 'calendar' ? 'on' : ''} onClick={() => setTab('calendar')}>לוח שנה</button>
        <button className={tab === 'all' ? 'on' : ''} onClick={() => setTab('all')}>כל המשימות</button>
        <button className={tab === 'progress' ? 'on' : ''} onClick={() => setTab('progress')}>התקדמות</button>
      </div>

      {tab === 'today' && <TodayTab onEdit={(task) => setForm({ task })} />}
      {tab === 'calendar' && <CalendarTab onEdit={(task) => setForm({ task })} onAdd={(date) => setForm({ date })} />}
      {tab === 'all' && <AllTab onEdit={(task) => setForm({ task })} />}
      {tab === 'progress' && <ProgressTab />}

      {form && <TaskForm initial={form.task} defaultDate={form.date} onClose={() => setForm(null)} />}
    </div>
  )
}

function TodayTab({ onEdit }: { onEdit: (t: Task) => void }) {
  const { tasks, completions } = useData()
  const t = today()
  const overdue = pastOverdue(tasks, completions)
  const todays = entriesFor(tasks, completions, t)
  const upcoming = useMemo(() => {
    const out = []
    for (let i = 1; i <= 7; i++) {
      const d = addDays(t, i)
      out.push(...entriesFor(tasks, completions, d).filter((e) => e.task.recurrence === 'once' || e.task.recurrence === 'monthly'))
    }
    return out
  }, [tasks, completions, t])
  const done = todays.filter((e) => e.done).length

  return (
    <div className="grid grid-3">
      <div className="span-2 stack">
        {overdue.length > 0 && (
          <div className="card" style={{ borderColor: 'color-mix(in srgb, var(--danger) 35%, var(--border))' }}>
            <div className="card-head"><h2 style={{ color: 'var(--danger)' }}>באיחור</h2><span className="badge-overdue">{overdue.length}</span></div>
            {overdue.map((e) => <TaskItem key={e.task.id} entry={e} onEdit={() => onEdit(e.task)} />)}
          </div>
        )}
        <div className="card">
          <div className="card-head"><h2>היום</h2><span className="small muted num">{done}/{todays.length}</span></div>
          {todays.map((e) => <TaskItem key={e.task.id} entry={e} onEdit={() => onEdit(e.task)} />)}
          {!todays.length && <div className="empty"><div className="e-icon">🌿</div>אין משימות להיום</div>}
        </div>
      </div>
      <div className="stack">
        <div className="card" style={{ textAlign: 'center' }}>
          <Ring value={todays.length ? done / todays.length : 0} />
          <div className="small text-2" style={{ marginTop: 8 }}>{todays.length === 0 ? 'אין משימות היום' : done === todays.length ? 'סיימת הכל! 🎉' : `נשארו ${todays.length - done} משימות`}</div>
        </div>
        <div className="card">
          <div className="card-head"><h2>בשבוע הקרוב</h2></div>
          {upcoming.map((e) => <TaskItem key={`${e.task.id}:${e.date}`} entry={e} onEdit={() => onEdit(e.task)} showDate />)}
          {!upcoming.length && <div className="small muted">אין משימות מתוכננות</div>}
        </div>
      </div>
    </div>
  )
}

function Ring({ value, size = 120 }: { value: number; size?: number }) {
  const r = size / 2 - 10
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct(value)} הושלמו`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={10} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--primary)" strokeWidth={10} strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray .6s' }} />
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontSize={24} fontWeight={700} fill="var(--text)">{pct(value)}</text>
    </svg>
  )
}

function CalendarTab({ onEdit, onAdd }: { onEdit: (t: Task) => void; onAdd: (date: string) => void }) {
  const { tasks, completions } = useData()
  const t = today()
  const [month, setMonth] = useState(startOfMonth(t))
  const [sel, setSel] = useState(t)
  const gridStart = startOfWeek(month)
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const lastRow = days.findIndex((d) => d > endOfMonth(month))
  const shown = days.slice(0, lastRow > 0 ? Math.ceil(lastRow / 7) * 7 : 42)
  const selEntries = entriesFor(tasks, completions, sel)

  return (
    <div className="grid grid-2">
      <div className="card">
        <div className="card-head">
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="החודש הקודם"><IconChevronRight /></button>
          <h2>{fmtMonth(month)}</h2>
          <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="החודש הבא"><IconChevronLeft /></button>
        </div>
        <div className="cal">
          {WEEKDAYS_SHORT.map((d) => <div key={d} className="dow">{d}</div>)}
          {shown.map((d) => {
            const items = tasks.filter((x) => !x.archived && occursOn(x, d))
            const cls = ['day', d.slice(0, 7) !== month.slice(0, 7) && 'out', d === t && 'today', d === sel && 'sel'].filter(Boolean).join(' ')
            return (
              <button key={d} className={cls} onClick={() => setSel(d)} aria-label={`${fromISO(d).getDate()} ב${MONTHS[fromISO(d).getMonth()]}, ${items.length} משימות`}>
                <span>{fromISO(d).getDate()}</span>
                <span className="dots">
                  {items.slice(0, 4).map((x) => {
                    const done = isDone(completions, x.id, d)
                    return <i key={x.id} className={done ? 'done' : d < t ? 'late' : ''} />
                  })}
                </span>
              </button>
            )
          })}
        </div>
        <div className="row xs muted" style={{ gap: 14, marginTop: 12, justifyContent: 'center' }}>
          <span className="row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 9, background: 'var(--rose)' }} />מתוכנן</span>
          <span className="row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 9, background: 'var(--success)' }} />בוצע</span>
          <span className="row" style={{ gap: 5 }}><i style={{ width: 7, height: 7, borderRadius: 9, background: 'var(--danger)' }} />לא בוצע</span>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h2>{fmtDayLong(sel)}</h2>
          <button className="btn sm outline" onClick={() => onAdd(sel)}><IconPlus />הוספה</button>
        </div>
        {selEntries.map((e) => <TaskItem key={e.task.id} entry={e} onEdit={() => onEdit(e.task)} />)}
        {!selEntries.length && <div className="empty"><div className="e-icon">📅</div>אין משימות ביום הזה</div>}
      </div>
    </div>
  )
}

function AllTab({ onEdit }: { onEdit: (t: Task) => void }) {
  const { tasks, completions, tagById, tags } = useData()
  const [tag, setTag] = useState<string>('')
  const t = today()
  const list = tasks.filter((x) => !x.archived && (!tag || x.tag_id === tag))
  const groups: { title: string; items: Task[] }[] = [
    { title: 'קבועות', items: list.filter((x) => x.recurrence !== 'once').sort((a, b) => (hhmm(a.reminder_time) || '99').localeCompare(hhmm(b.reminder_time) || '99')) },
    { title: 'חד-פעמיות: פתוחות', items: list.filter((x) => x.recurrence === 'once' && !isDone(completions, x.id, x.due_date!)).sort((a, b) => a.due_date!.localeCompare(b.due_date!)) },
    { title: 'חד-פעמיות: הושלמו', items: list.filter((x) => x.recurrence === 'once' && isDone(completions, x.id, x.due_date!)).sort((a, b) => b.due_date!.localeCompare(a.due_date!)).slice(0, 30) },
  ]

  return (
    <div className="stack">
      <div className="chips">
        <button className={`chip ${!tag ? 'on' : ''}`} onClick={() => setTag('')}>הכל</button>
        {tags.map((x) => <button key={x.id} className={`chip ${tag === x.id ? 'on' : ''}`} onClick={() => setTag(x.id)}><span className="dot" style={{ background: x.color }} />{x.name}</button>)}
      </div>
      {groups.filter((g) => g.items.length).map((g) => (
        <div className="card" key={g.title}>
          <div className="card-head"><h2>{g.title}</h2><span className="small muted">{g.items.length}</span></div>
          <div className="list">
            {g.items.map((x) => {
              const tg = x.tag_id ? tagById.get(x.tag_id) : null
              const s = streak(x, completions)
              const late = x.recurrence === 'once' && x.due_date! < t && !isDone(completions, x.id, x.due_date!)
              return (
                <div key={x.id} className="list-item clickable" onClick={() => onEdit(x)}>
                  <div className="grow">
                    <div style={{ fontWeight: 500, color: late ? 'var(--danger)' : undefined }}>{x.title}</div>
                    <div className="xs muted row wrap" style={{ gap: 8, marginTop: 3 }}>
                      <span>{x.recurrence === 'once' ? fmtDayLong(x.due_date!) : recurrenceLabel(x)}</span>
                      {x.reminder_time && <span>⏰ {hhmm(x.reminder_time)}</span>}
                      {tg && <span className="tag"><span className="dot" style={{ background: tg.color }} />{tg.name}</span>}
                      {x.subtasks.length > 0 && <span>☑ {x.subtasks.length}</span>}
                    </div>
                  </div>
                  {s > 0 && <span className="streak small">🔥 {s}</span>}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {!list.length && <div className="card empty"><div className="e-icon">📝</div>עוד אין משימות</div>}
    </div>
  )
}

function ProgressTab() {
  const { tasks, completions } = useData()
  const t = today()
  const week = completionRate(tasks, completions, startOfWeek(t), t)
  const month = completionRate(tasks, completions, startOfMonth(t), t)

  const weeks = useMemo(() => Array.from({ length: 8 }, (_, i) => {
    const from = addDays(startOfWeek(t), -7 * (7 - i))
    const r = completionRate(tasks, completions, from, addDays(from, 6))
    const d = fromISO(from)
    return { label: `${d.getDate()}.${d.getMonth() + 1}`, ...r }
  }), [tasks, completions, t])

  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => {
    const from = addMonths(startOfMonth(t), -(5 - i))
    const r = completionRate(tasks, completions, from, endOfMonth(from))
    return { label: MONTHS[fromISO(from).getMonth()], ...r }
  }), [tasks, completions, t])

  const streaks = tasks.filter((x) => !x.archived && x.recurrence !== 'once')
    .map((x) => ({ task: x, s: streak(x, completions) })).sort((a, b) => b.s - a.s)

  return (
    <div className="grid grid-2">
      <div className="card stat"><span className="k">השבוע</span><span className="v num">{pct(week.rate)}</span><span className="d">{week.done} מתוך {week.total} משימות</span>
        <div className={`progress ${week.rate >= .8 ? 'good' : week.rate >= .5 ? '' : 'warn'}`} style={{ marginTop: 8 }}><div style={{ width: `${week.rate * 100}%` }} /></div></div>
      <div className="card stat"><span className="k">החודש</span><span className="v num">{pct(month.rate)}</span><span className="d">{month.done} מתוך {month.total} משימות</span>
        <div className={`progress ${month.rate >= .8 ? 'good' : month.rate >= .5 ? '' : 'warn'}`} style={{ marginTop: 8 }}><div style={{ width: `${month.rate * 100}%` }} /></div></div>
      <div className="card"><div className="card-head"><h2>אחוז השלמה שבועי</h2><span className="xs muted">8 שבועות אחרונים</span></div><RateBars rows={weeks} /></div>
      <div className="card"><div className="card-head"><h2>אחוז השלמה חודשי</h2><span className="xs muted">6 חודשים אחרונים</span></div><RateBars rows={months} /></div>
      <div className="card span-2">
        <div className="card-head"><h2>רצפים 🔥</h2></div>
        <div className="list">
          {streaks.map(({ task, s }) => (
            <div key={task.id} className="list-item">
              <div className="grow"><div style={{ fontWeight: 500 }}>{task.title}</div><div className="xs muted">{recurrenceLabel(task)}</div></div>
              <div className="num" style={{ fontWeight: 700, color: s ? '#c2410c' : 'var(--muted)' }}>{s ? `🔥 ${s}` : '0'}</div>
            </div>
          ))}
          {!streaks.length && <div className="empty small">רצפים נספרים למשימות קבועות. הוסף משימה יומית או שבועית כדי להתחיל</div>}
        </div>
      </div>
    </div>
  )
}
