import { useState } from 'react'
import { useData } from '../hooks/useData'
import { hhmm, relativeDay, today } from '../lib/dates'
import { ckey, recurrenceLabel, streak } from '../lib/recurrence'
import type { Entry } from '../lib/taskView'
import { IconCheck, IconClock, IconRepeat } from './Icons'

export function TaskItem({ entry, onEdit, showDate }: { entry: Entry; onEdit: () => void; showDate?: boolean }) {
  const { completions, setDone, toggleSubtask, tagById } = useData()
  const { task, date, done, overdue } = entry
  const [open, setOpen] = useState(false)
  const tag = task.tag_id ? tagById.get(task.tag_id) : null
  const doneSubs = new Set(completions.get(ckey(task.id, date))?.done_subtasks ?? [])
  const s = task.recurrence !== 'once' ? streak(task, completions) : 0
  const canToggle = date <= today() || task.recurrence === 'once'

  return (
    <div className={`task ${done ? 'done' : ''} ${overdue ? 'overdue' : ''}`}>
      <button className={`check ${done ? 'on' : ''}`} aria-label={done ? 'סימון כלא בוצע' : 'סימון כבוצע'} aria-pressed={done}
        disabled={!canToggle} style={{ opacity: canToggle ? 1 : 0.4 }}
        onClick={() => { void setDone(task, date, !done); if (!done && navigator.vibrate) navigator.vibrate(12) }}>
        <IconCheck />
      </button>
      <div className="grow" onClick={onEdit} style={{ cursor: 'pointer' }}>
        <div className="title">{task.title}</div>
        <div className="meta">
          {overdue && <span className="badge-overdue">באיחור{date < today() ? ` · ${relativeDay(date)}` : ''}</span>}
          {showDate && !overdue && <span>{relativeDay(date)}</span>}
          {task.reminder_time && <span className="row" style={{ gap: 3 }}><IconClock width={13} height={13} />{hhmm(task.reminder_time)}</span>}
          {task.recurrence !== 'once' && <span className="row" style={{ gap: 3 }}><IconRepeat width={13} height={13} />{recurrenceLabel(task)}</span>}
          {tag && <span className="tag"><span className="dot" style={{ background: tag.color }} />{tag.name}</span>}
          {s > 1 && <span className="streak">🔥 {s}</span>}
          {task.subtasks.length > 0 && (
            <button className="tag" style={{ border: 'none', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
              ☑ {doneSubs.size}/{task.subtasks.length}
            </button>
          )}
        </div>
        {open && task.subtasks.length > 0 && (
          <div className="subtasks" onClick={(e) => e.stopPropagation()}>
            {task.subtasks.map((st) => (
              <label key={st.id} className={`subtask ${doneSubs.has(st.id) ? 'done' : ''}`}>
                <button type="button" className={`check sm ${doneSubs.has(st.id) ? 'on' : ''}`} onClick={() => void toggleSubtask(task, date, st.id)} aria-label={st.title}>
                  <IconCheck />
                </button>
                <span>{st.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
