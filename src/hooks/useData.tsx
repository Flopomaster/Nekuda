import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { ckey, type CompletionMap } from '../lib/recurrence'
import type { Category, Completion, PaymentMethod, Settings, Task, TaskTag, Transaction } from '../lib/types'
import { useToast } from '../components/Toast'

type Data = {
  loading: boolean
  settings: Settings | null
  categories: Category[]
  paymentMethods: PaymentMethod[]
  tags: TaskTag[]
  transactions: Transaction[]
  tasks: Task[]
  completions: CompletionMap
  categoryById: Map<string, Category>
  paymentById: Map<string, PaymentMethod>
  tagById: Map<string, TaskTag>
  reload: () => Promise<void>
  saveTransaction: (t: Partial<Transaction>) => Promise<boolean>
  deleteTransaction: (id: string) => Promise<void>
  importTransactions: (rows: Partial<Transaction>[]) => Promise<number | null>
  saveTask: (t: Partial<Task>) => Promise<boolean>
  deleteTask: (id: string) => Promise<void>
  setDone: (task: Task, date: string, done: boolean) => Promise<void>
  toggleSubtask: (task: Task, date: string, subtaskId: string) => Promise<void>
  saveSettings: (s: Partial<Settings>) => Promise<void>
  saveRow: (table: 'categories' | 'payment_methods' | 'task_tags', row: Record<string, unknown>) => Promise<void>
}

const Ctx = createContext<Data | null>(null)

// PostgREST caps responses at 1000 rows, so page through bigger tables
async function fetchAll<T>(table: string, order: string, ascending = true): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending }).range(from, from + 999)
    if (error) throw error
    out.push(...(data as T[]))
    if (!data || data.length < 1000) return out
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [tags, setTags] = useState<TaskTag[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [completions, setCompletions] = useState<CompletionMap>(new Map())

  const fail = useCallback((e: unknown) => {
    console.error(e)
    toast('משהו השתבש. נסה שוב', 'error')
  }, [toast])

  const reload = useCallback(async () => {
    try {
      const [s, c, p, tg, tx, tk, cm] = await Promise.all([
        supabase.from('settings').select('*').maybeSingle(),
        fetchAll<Category>('categories', 'sort'),
        fetchAll<PaymentMethod>('payment_methods', 'sort'),
        fetchAll<TaskTag>('task_tags', 'sort'),
        fetchAll<Transaction>('transactions', 'occurred_on', false),
        fetchAll<Task>('tasks', 'created_at'),
        fetchAll<Completion>('task_completions', 'occurrence_date'),
      ])
      setSettings(s.data as Settings | null)
      setCategories(c)
      setPaymentMethods(p)
      setTags(tg)
      setTransactions(tx.map((t) => ({ ...t, amount: Number(t.amount) })))
      setTasks(tk)
      setCompletions(new Map(cm.map((x) => [ckey(x.task_id, x.occurrence_date), x])))
    } catch (e) {
      fail(e)
    } finally {
      setLoading(false)
    }
  }, [fail])

  useEffect(() => { void reload() }, [reload])

  const saveTransaction = useCallback(async (t: Partial<Transaction>) => {
    const { data, error } = await supabase.from('transactions').upsert(t).select().single()
    if (error) { fail(error); return false }
    const row = { ...(data as Transaction), amount: Number(data.amount) }
    setTransactions((prev) => [row, ...prev.filter((x) => x.id !== row.id)]
      .sort((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)))
    return true
  }, [fail])

  const deleteTransaction = useCallback(async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) return fail(error)
    setTransactions((prev) => prev.filter((x) => x.id !== id))
  }, [fail])

  /** Bulk insert from a bank file; rows already imported (same external_id) are skipped. */
  const importTransactions = useCallback(async (rows: Partial<Transaction>[]) => {
    let added = 0
    for (let i = 0; i < rows.length; i += 200) {
      const { data, error } = await supabase.from('transactions')
        .upsert(rows.slice(i, i + 200), { onConflict: 'user_id,external_id', ignoreDuplicates: true }).select('id')
      if (error) { fail(error); await reload(); return null }
      added += data?.length ?? 0
    }
    await reload()
    return added
  }, [fail, reload])

  const saveTask = useCallback(async (t: Partial<Task>) => {
    const { data, error } = await supabase.from('tasks').upsert(t).select().single()
    if (error) { fail(error); return false }
    setTasks((prev) => [...prev.filter((x) => x.id !== data.id), data as Task])
    return true
  }, [fail])

  const deleteTask = useCallback(async (id: string) => {
    const { error } = await supabase.from('tasks').delete().eq('id', id)
    if (error) return fail(error)
    setTasks((prev) => prev.filter((x) => x.id !== id))
  }, [fail])

  const writeCompletion = useCallback(async (row: Completion) => {
    const key = ckey(row.task_id, row.occurrence_date)
    let previous: Completion | undefined
    setCompletions((prev) => {
      previous = prev.get(key)
      return new Map(prev).set(key, row) // optimistic
    })
    const { error } = await supabase.from('task_completions').upsert(row)
    if (error) {
      setCompletions((prev) => {
        const m = new Map(prev)
        if (previous) m.set(key, previous)
        else m.delete(key)
        return m
      })
      fail(error)
    }
  }, [fail])

  const setDone = useCallback(async (task: Task, date: string, done: boolean) => {
    await writeCompletion({
      task_id: task.id,
      occurrence_date: date,
      done,
      done_subtasks: done ? task.subtasks.map((s) => s.id) : [],
      completed_at: done ? new Date().toISOString() : null,
    })
  }, [writeCompletion])

  const toggleSubtask = useCallback(async (task: Task, date: string, subtaskId: string) => {
    const cur = completions.get(ckey(task.id, date))
    const set = new Set(cur?.done_subtasks ?? [])
    if (set.has(subtaskId)) set.delete(subtaskId)
    else set.add(subtaskId)
    const allDone = task.subtasks.length > 0 && task.subtasks.every((s) => set.has(s.id))
    await writeCompletion({
      task_id: task.id,
      occurrence_date: date,
      done: allDone,
      done_subtasks: [...set],
      completed_at: allDone ? new Date().toISOString() : null,
    })
  }, [completions, writeCompletion])

  const saveSettings = useCallback(async (s: Partial<Settings>) => {
    const { data, error } = await supabase.from('settings').update({ ...s, updated_at: new Date().toISOString() })
      .eq('user_id', settings?.user_id ?? '').select().single()
    if (error) return fail(error)
    setSettings(data as Settings)
  }, [fail, settings?.user_id])

  const saveRow = useCallback(async (table: 'categories' | 'payment_methods' | 'task_tags', row: Record<string, unknown>) => {
    const { data, error } = await supabase.from(table).upsert(row).select().single()
    if (error) return fail(error)
    const upd = <T extends { id: string; sort: number }>(prev: T[]) =>
      [...prev.filter((x) => x.id !== data.id), data as T].sort((a, b) => a.sort - b.sort)
    if (table === 'categories') setCategories(upd)
    else if (table === 'payment_methods') setPaymentMethods(upd)
    else setTags(upd)
  }, [fail])

  const value = useMemo<Data>(() => ({
    loading, settings, categories, paymentMethods, tags, transactions, tasks, completions,
    categoryById: new Map(categories.map((c) => [c.id, c])),
    paymentById: new Map(paymentMethods.map((p) => [p.id, p])),
    tagById: new Map(tags.map((t) => [t.id, t])),
    reload, saveTransaction, deleteTransaction, importTransactions, saveTask, deleteTask, setDone, toggleSubtask, saveSettings, saveRow,
  }), [loading, settings, categories, paymentMethods, tags, transactions, tasks, completions,
    reload, saveTransaction, deleteTransaction, importTransactions, saveTask, deleteTask, setDone, toggleSubtask, saveSettings, saveRow])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData outside DataProvider')
  return v
}
