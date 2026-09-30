import { useCallback, useEffect, useState } from 'react'
import { IconBackspace, IconFace } from '../components/Icons'
import { checkPin, hasBio, setPin, verifyBio } from '../lib/lock'

const LEN = 4

/** mode 'unlock' verifies; mode 'setup' asks twice and stores a new PIN. */
export function LockScreen({ mode, onDone, onSkip }: { mode: 'unlock' | 'setup'; onDone: () => void; onSkip?: () => void }) {
  const [pin, setPinValue] = useState('')
  const [first, setFirst] = useState<string | null>(null)
  const [shake, setShake] = useState(false)
  const bio = mode === 'unlock' && hasBio()

  const tryBio = useCallback(async () => {
    if (await verifyBio()) onDone()
  }, [onDone])

  useEffect(() => { if (bio) void tryBio() }, [bio, tryBio])

  const fail = () => {
    setShake(true)
    if (navigator.vibrate) navigator.vibrate([30, 40, 30])
    setTimeout(() => { setShake(false); setPinValue('') }, 420)
  }

  const press = async (d: string) => {
    const next = (pin + d).slice(0, LEN)
    setPinValue(next)
    if (next.length < LEN) return
    if (mode === 'unlock') {
      if (await checkPin(next)) onDone()
      else fail()
    } else if (first === null) {
      setFirst(next)
      setTimeout(() => setPinValue(''), 150)
    } else if (first === next) {
      await setPin(next)
      onDone()
    } else {
      setFirst(null)
      fail()
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) void press(e.key)
      else if (e.key === 'Backspace') setPinValue((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const title = mode === 'unlock' ? 'הזן קוד' : first === null ? 'בחר קוד PIN בן 4 ספרות' : 'הזן שוב לאישור'

  return (
    <div className="center-screen">
      <div className="lock">
        <img src="/icon-192.png" alt="" style={{ width: 60, height: 60, borderRadius: 16 }} />
        <h1>{title}</h1>
        {mode === 'setup' && <div style={{ opacity: .75, fontSize: 14 }}>הקוד יידרש בכל פתיחה של האפליקציה</div>}
        <div className={`pin-dots ${shake ? 'shake' : ''}`}>
          {Array.from({ length: LEN }, (_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
        </div>
        <div className="keypad">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => void press(d)}>{d}</button>)}
          {bio ? <button className="plain" onClick={() => void tryBio()} aria-label="Face ID"><IconFace /></button>
            : onSkip ? <button className="plain" onClick={onSkip}>אחר כך</button> : <span />}
          <button onClick={() => void press('0')}>0</button>
          <button className="plain" onClick={() => setPinValue((p) => p.slice(0, -1))} aria-label="מחיקה"><IconBackspace /></button>
        </div>
      </div>
    </div>
  )
}
