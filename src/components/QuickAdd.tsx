import { useState } from 'react'
import { Sheet } from './Sheet'
import { TaskForm } from './TaskForm'
import { TransactionForm } from './TransactionForm'

export function QuickAdd({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'pick' | 'expense' | 'income' | 'task'>('pick')
  if (mode === 'expense' || mode === 'income') return <TransactionForm defaultKind={mode} onClose={onClose} />
  if (mode === 'task') return <TaskForm onClose={onClose} />
  return (
    <Sheet title="מה להוסיף?" onClose={onClose}>
      <div className="quick-grid">
        <button onClick={() => setMode('expense')}><span className="qi" style={{ background: 'var(--danger-soft)' }}>💸</span>הוצאה</button>
        <button onClick={() => setMode('income')}><span className="qi" style={{ background: 'var(--success-soft)' }}>💰</span>הכנסה</button>
        <button onClick={() => setMode('task')}><span className="qi" style={{ background: 'var(--primary-soft)' }}>✅</span>משימה</button>
      </div>
    </Sheet>
  )
}
