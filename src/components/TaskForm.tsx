import { useState } from 'react'
import { useData } from '../hooks/useData'
import { fromISO, today, WEEKDAYS_SHORT } from '../lib/dates'
import { uid } from '../lib/format'
import type { Recurrence, Subtask, Task } from '../lib/types'
import { IconPlus, IconTrash, IconX } from './Icons'
import { Confirm, Sheet } from './Sheet'
import { useToast } from './Toast'

const RECURRENCE: { id: Recurrence; label: string }[] = [
  { id: 'once', label: 'חד-פעמית' },
  { id: 'daily', label: 'יומית' },
  { id: 'weekly', label: 'שבועית' },
  { id: 'monthly', label: 'חודשית' },
]

export function TaskForm({ initial, defaultDate, onClose }: { initial?: Task; defaultDate?: string; onClose: () => void }) {
  const { tags, saveTask, deleteTask } = useData()
  const toast = useToast()
  const startDay = defaultDate ?? today()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [recurrence, setRecurrence] = useState<Recurrence>(initial?.recurrence ?? 'once')
  const [dueDate, setDueDate] = useState(initial?.due_date ?? startDay)
  const [startDate, setStartDate] = useState(initial?.start_date ?? startDay)
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays?.length ? initial.weekdays : [fromISO(startDay).getDay()])
  const [monthDay, setMonthDay] = useState(initial?.month_day ?? fromISO(startDay).getDate())
  const [hasReminder, setHasReminder] = useState(!!initial?.reminder_time || !initial)
  const [time, setTime] = useState(initial?.reminder_time?.slice(0, 5) ?? '09:00')
  const [tagId, setTagId] = useState<string | null>(initial?.tag_id ?? null)
  const [subtasks, setSubtasks] = useState<Subtask[]>(initial?.subtasks ?? [])
  const [newSub, setNewSub] = useState('')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const valid = title.trim() && (recurrence !== 'weekly' || weekdays.length > 0)

  const addSub = () => {
    if (!newSub.trim()) return
    setSubtasks((s) => [...s, { id: uid(), title: newSub.trim() }])
    setNewSub('')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid) return
    setSaving(true)
    const ok = await saveTask({
      ...(initial ? { id: initial.id } : {}),
      title: title.trim(),
      notes: notes.trim() || null,
      tag_id: tagId,
      recurrence,
      due_date: recurrence === 'once' ? dueDate : null,
      start_date: recurrence === 'once' ? dueDate : startDate,
      weekdays: recurrence === 'weekly' ? [...weekdays].sort() : [],
      month_day: recurrence === 'monthly' ? monthDay : null,
      reminder_time: hasReminder ? time : null,
      subtasks,
    })
    setSaving(false)
    if (ok) {
      toast(initial ? 'המשימה עודכנה ✓' : 'המשימה נוספה ✓')
      onClose()
    }
  }

  return (
    <Sheet title={initial ? 'עריכת משימה' : 'משימה חדשה'} onClose={onClose}>
      <form onSubmit={submit} className="stack">
        <input className="input" style={{ fontSize: 19, fontWeight: 500 }} placeholder="מה צריך לעשות?" value={title}
          onChange={(e) => setTitle(e.target.value)} autoFocus={!initial} />

        <div className="segmented full">
          {RECURRENCE.map((r) => (
            <button type="button" key={r.id} className={recurrence === r.id ? 'on' : ''} onClick={() => setRecurrence(r.id)}>{r.label}</button>
          ))}
        </div>

        {recurrence === 'once' && (
          <label className="field"><span>תאריך</span>
            <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
          </label>
        )}
        {recurrence === 'weekly' && (
          <div className="field"><span>באילו ימים</span>
            <div className="chips">
              {WEEKDAYS_SHORT.map((d, i) => (
                <button type="button" key={i} className={`chip ${weekdays.includes(i) ? 'on' : ''}`} style={{ minWidth: 42, justifyContent: 'center' }}
                  onClick={() => setWeekdays((w) => (w.includes(i) ? w.filter((x) => x !== i) : [...w, i]))}>{d}</button>
              ))}
            </div>
          </div>
        )}
        {recurrence === 'monthly' && (
          <label className="field"><span>יום בחודש</span>
            <select className="select" value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}{d >= 29 ? ' (או היום האחרון בחודש)' : ''}</option>)}
            </select>
          </label>
        )}
        {recurrence !== 'once' && (
          <label className="field"><span>החל מ-</span>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </label>
        )}

        <div className="field">
          <label className="row between" style={{ cursor: 'pointer' }}>
            <span className="text-2" style={{ fontSize: 13, fontWeight: 500 }}>תזכורת בפוש</span>
            <input type="checkbox" checked={hasReminder} onChange={(e) => setHasReminder(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--primary)' }} />
          </label>
          {hasReminder && <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />}
        </div>

        <div className="field"><span>קטגוריה</span>
          <div className="chips">
            {tags.map((t) => (
              <button type="button" key={t.id} className={`chip ${tagId === t.id ? 'on' : ''}`} onClick={() => setTagId(tagId === t.id ? null : t.id)}>
                <span className="dot" style={{ background: t.color }} />{t.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field"><span>תתי-משימות</span>
          {subtasks.map((s) => (
            <div key={s.id} className="row">
              <input className="input" value={s.title} onChange={(e) => setSubtasks((x) => x.map((y) => (y.id === s.id ? { ...y, title: e.target.value } : y)))} />
              <button type="button" className="icon-btn" aria-label="הסרה" onClick={() => setSubtasks((x) => x.filter((y) => y.id !== s.id))}><IconX /></button>
            </div>
          ))}
          <div className="row">
            <input className="input" placeholder="הוספת תת-משימה" value={newSub} onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub() } }} />
            <button type="button" className="icon-btn" aria-label="הוספה" onClick={addSub}><IconPlus /></button>
          </div>
        </div>

        <label className="field"><span>הערות</span>
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="לא חובה" />
        </label>

        <div className="row">
          <button className="btn primary grow" disabled={!valid || saving}>{saving ? 'שומר…' : 'שמירה'}</button>
          {initial && <button type="button" className="btn danger" onClick={() => setConfirm(true)} aria-label="מחיקה"><IconTrash /></button>}
        </div>
      </form>
      {confirm && initial && (
        <Confirm text="המשימה וכל היסטוריית ההשלמה שלה יימחקו." onClose={() => setConfirm(false)}
          onYes={async () => { await deleteTask(initial.id); toast('המשימה נמחקה'); onClose() }} />
      )}
    </Sheet>
  )
}
