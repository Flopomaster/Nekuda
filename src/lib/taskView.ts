import { hhmm, nowHHMM, today } from './dates'
import { isDone, occursOn, type CompletionMap } from './recurrence'
import type { Task } from './types'

export type Entry = { task: Task; date: string; done: boolean; overdue: boolean }

const byTime = (a: Entry, b: Entry) =>
  Number(a.done) - Number(b.done) || (hhmm(a.task.reminder_time) || '99').localeCompare(hhmm(b.task.reminder_time) || '99') ||
  a.task.title.localeCompare(b.task.title, 'he')

/** Tasks scheduled on a given day. Today's items whose reminder time passed are overdue. */
export function entriesFor(tasks: Task[], map: CompletionMap, date: string): Entry[] {
  const t = today()
  const now = nowHHMM()
  return tasks
    .filter((task) => !task.archived && occursOn(task, date))
    .map((task) => {
      const done = isDone(map, task.id, date)
      const overdue = !done && (date < t || (date === t && !!task.reminder_time && hhmm(task.reminder_time) < now))
      return { task, date, done, overdue }
    })
    .sort(byTime)
}

/** One-time tasks from past days that were never completed. */
export function pastOverdue(tasks: Task[], map: CompletionMap): Entry[] {
  const t = today()
  return tasks
    .filter((task) => !task.archived && task.recurrence === 'once' && task.due_date && task.due_date < t && !isDone(map, task.id, task.due_date))
    .map((task) => ({ task, date: task.due_date!, done: false, overdue: true }))
    .sort((a, b) => a.date.localeCompare(b.date))
}
