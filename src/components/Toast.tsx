import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Kind = 'info' | 'error'
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; msg: string; kind: Kind }[]>([])
  const show = useCallback((msg: string, kind: Kind = 'info') => {
    const id = Date.now() + Math.random()
    setItems((x) => [...x, { id, msg, kind }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2600)
  }, [])
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-wrap" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
