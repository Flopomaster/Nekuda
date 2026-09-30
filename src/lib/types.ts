export type Kind = 'expense' | 'income'

export type Category = {
  id: string
  kind: Kind
  name: string
  icon: string
  sort: number
  archived: boolean
}

export type PaymentMethod = { id: string; name: string; sort: number; archived: boolean }

export type Transaction = {
  id: string
  kind: Kind
  amount: number
  occurred_on: string
  category_id: string | null
  merchant: string | null
  payment_method_id: string | null
  note: string | null
  created_at: string
}

export type Settings = {
  user_id: string
  savings_goal: number | null
  income_goal: number | null
  evening_reminder_time: string
  timezone: string
}

export type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly'

export type Subtask = { id: string; title: string }

export type TaskTag = { id: string; name: string; color: string; sort: number }

export type Task = {
  id: string
  title: string
  notes: string | null
  tag_id: string | null
  recurrence: Recurrence
  due_date: string | null
  start_date: string
  weekdays: number[]
  month_day: number | null
  reminder_time: string | null
  subtasks: Subtask[]
  archived: boolean
  created_at: string
}

export type Completion = {
  task_id: string
  occurrence_date: string
  done: boolean
  done_subtasks: string[]
  completed_at: string | null
}
