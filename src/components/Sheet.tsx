import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconX } from './Icons'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="סגירה"><IconX /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function Confirm({ text, onYes, onClose }: { text: string; onYes: () => void; onClose: () => void }) {
  return (
    <Sheet title="בטוח?" onClose={onClose}>
      <p className="text-2" style={{ marginTop: 0 }}>{text}</p>
      <div className="row" style={{ marginTop: 18 }}>
        <button className="btn danger grow" onClick={() => { onYes(); onClose() }}>מחיקה</button>
        <button className="btn grow" onClick={onClose}>ביטול</button>
      </div>
    </Sheet>
  )
}
