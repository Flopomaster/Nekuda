import { addDays, fromISO, today } from './dates'
import type { Completion, Task } from './types'

// Mirrored in supabase/functions/send-reminders/index.ts
export function occursOn(task: Task, date: string): boolean {
  if (task.recurrence === 'once') return task.due_date === date
  if (date < task.start_date) return false
  const d = fromISO(date)
  if (task.recurrence === 'daily') return true
  if (task.recurrence === 'weekly') return task.weekdays.includes(d.getDay())
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return d.getDate() === Math.min(task.month_day ?? 1, lastDay)
}

export type CompletionMap = Map<string, Completion>
export const ckey = (taskId: string, date: string) => `${taskId}:${date}`
export const isDone = (map: CompletionMap, taskId: string, date: string) => !!map.get(ckey(taskId, date))?.done

/** Consecutive completed occurrences, counting back from today (today only counts once done). */
export function streak(task: Task, map: CompletionMap): number {
  if (task.recurrence === 'once') return 0
  let count = 0
  let d = today()
  if (occursOn(task, d) && !isDone(map, task.id, d)) d = addDays(d, -1)
  for (let i = 0; i < 400 && d >= task.start_date; i++, d = addDays(d, -1)) {
    if (!occursOn(task, d)) continue
    if (!isDone(map, task.id, d)) break
    count++
  }
  return count
}

export function recurrenceLabel(task: Task): string {
  const days = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
  switch (task.recurrence) {
    case 'daily': return 'כל יום'
    case 'weekly': return task.weekdays.length === 7 ? 'כל יום' : `כל ${[...task.weekdays].sort().map((d) => days[d]).join(', ')}`
    case 'monthly': return `כל ${task.month_day} בחודש`
    default: return 'חד-פעמית'
  }
}

/** Completion rate over a date range: done occurrences / scheduled occurrences (up to today). */
export function completionRate(tasks: Task[], map: CompletionMap, from: string, to: string) {
  let total = 0
  let done = 0
  const end = to < today() ? to : today()
  for (let d = from; d <= end; d = addDays(d, 1)) {
    for (const t of tasks) {
      if (t.archived || !occursOn(t, d)) continue
      total++
      if (isDone(map, t.id, d)) done++
    }
  }
  return { total, done, rate: total ? done / total : 0 }
}
