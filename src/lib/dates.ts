// Dates are handled as local 'YYYY-MM-DD' strings to avoid timezone drift.
export const pad = (n: number) => String(n).padStart(2, '0')

export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const today = () => toISO(new Date())

export function addDays(iso: string, n: number) {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export function addMonths(iso: string, n: number) {
  const d = fromISO(iso)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, daysInMonth(d.getFullYear(), d.getMonth())))
  return toISO(d)
}
export const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate()
export const startOfMonth = (iso: string) => iso.slice(0, 8) + '01'
export function endOfMonth(iso: string) {
  const d = fromISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}
export const startOfWeek = (iso: string) => addDays(iso, -fromISO(iso).getDay()) // week starts Sunday
export const dayDiff = (a: string, b: string) =>
  Math.round((fromISO(b).getTime() - fromISO(a).getTime()) / 864e5)

export function eachDay(from: string, to: string) {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']
export const WEEKDAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']
export const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']

export const fmtDate = (iso: string) => {
  const d = fromISO(iso)
  return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`
}
export const fmtDayLong = (iso: string) => {
  const d = fromISO(iso)
  return `יום ${WEEKDAYS[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]}`
}
export const fmtMonth = (iso: string) => {
  const d = fromISO(iso)
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
export function relativeDay(iso: string) {
  const diff = dayDiff(today(), iso)
  if (diff === 0) return 'היום'
  if (diff === -1) return 'אתמול'
  if (diff === 1) return 'מחר'
  return fmtDayLong(iso)
}
export const nowHHMM = () => {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '')
