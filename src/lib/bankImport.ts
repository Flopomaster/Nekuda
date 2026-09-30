import type { Category, Kind, PaymentMethod, Transaction } from './types'

// ---------------- Parsing ----------------
export type RawRow = { date: string; description: string; amount: number; ref: string }

const HEADERS = {
  date: ['תאריך', 'תאריך עסקה', 'תאריך רכישה', 'תאריך ערך'],
  description: ['תיאור', 'שם בית העסק', 'שם בית עסק', 'בית עסק', 'פרטים', 'תיאור התנועה'],
  amount: ['סכום', 'סכום חיוב', 'סכום בש"ח', 'סכום העסקה', 'סכום עסקה'],
  debit: ['חובה'],
  credit: ['זכות'],
  ref: ['אסמכתא', 'מספר אסמכתא'],
}

const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

function cellValue(v: unknown): unknown {
  if (v && typeof v === 'object') {
    const o = v as { richText?: { text: string }[]; result?: unknown; text?: string }
    if (o.richText) return o.richText.map((t) => t.text).join('')
    if (o.result !== undefined) return o.result
    if (o.text !== undefined) return o.text
  }
  return v
}

function parseDate(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = norm(v)
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (!m) return null
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function parseNumber(v: unknown): number | null {
  if (typeof v === 'number') return v
  const s = norm(v).replace(/[₪,\s]/g, '')
  if (!s) return null
  const n = Number(s.replace(/^\((.*)\)$/, '-$1'))
  return Number.isFinite(n) ? n : null
}

/** Reads a bank/credit-card export (xlsx or csv) and finds the transactions table by its header row. */
export async function parseStatement(file: File): Promise<{ rows: RawRow[]; source: string; owner: string | null }> {
  let table: unknown[][]
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text()
    table = text.split(/\r?\n/).map((line) => line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((c) => c.replace(/^"|"$/g, '')))
  } else {
    const { default: ExcelJS } = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await file.arrayBuffer())
    table = []
    wb.worksheets[0].eachRow({ includeEmpty: true }, (row, i) => {
      table[i - 1] = (row.values as unknown[]).slice(1).map(cellValue)
    })
  }

  // Locate the header row
  let headerIdx = -1
  let cols: Record<keyof typeof HEADERS, number> = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, ref: -1 }
  for (let i = 0; i < Math.min(table.length, 40) && headerIdx < 0; i++) {
    const cells = (table[i] ?? []).map(norm)
    const find = (names: string[]) => cells.findIndex((c) => names.includes(c))
    const c = { date: find(HEADERS.date), description: find(HEADERS.description), amount: find(HEADERS.amount), debit: find(HEADERS.debit), credit: find(HEADERS.credit), ref: find(HEADERS.ref) }
    if (c.date >= 0 && c.description >= 0 && (c.amount >= 0 || c.debit >= 0)) { headerIdx = i; cols = c }
  }
  if (headerIdx < 0) throw new Error('לא נמצאה טבלת תנועות בקובץ')

  // Account owner's name (e.g. Pepper's "שם לקוח:") lets us spot transfers between your own accounts
  let owner: string | null = null
  for (const r of table.slice(0, headerIdx)) {
    const cells = (r ?? []).map(norm)
    const i = cells.findIndex((c) => /^(שם לקוח|שם בעל החשבון|בעל החשבון):?$/.test(c))
    if (i >= 0 && cells[i + 1]) owner = cells[i + 1]
  }
  const isCard = cols.amount >= 0 && /חיוב|עסקה/.test(norm(table[headerIdx][cols.amount]))
  const source = /pepper/i.test(JSON.stringify(table.slice(-3))) ? 'pepper' : isCard ? 'card' : 'bank'

  const rows: RawRow[] = []
  for (const r of table.slice(headerIdx + 1)) {
    if (!r) continue
    const date = parseDate(r[cols.date])
    const description = norm(r[cols.description])
    let amount = cols.amount >= 0 ? parseNumber(r[cols.amount]) : null
    if (cols.debit >= 0 && amount === null) {
      const debit = parseNumber(r[cols.debit]) ?? 0
      const credit = cols.credit >= 0 ? (parseNumber(r[cols.credit]) ?? 0) : 0
      amount = credit - debit
    }
    if (!date || !description || !amount) continue
    // Credit-card exports list purchases as positive charges
    if (isCard) amount = -amount
    rows.push({ date, description, amount, ref: cols.ref >= 0 ? norm(r[cols.ref]) : '' })
  }
  return { rows, source, owner }
}

// ---------------- Classification ----------------
export type ImportRow = {
  key: string
  include: boolean
  kind: Kind
  amount: number
  date: string
  merchant: string
  categoryId: string | null
  paymentMethodId: string | null
  note: string | null
  flag?: 'duplicate' | 'internal' | 'card-bill'
}

/** Keyword rules → default category names (matched against the user's categories by name). */
const RULES: { cat: string; kind: Kind; words: RegExp }[] = [
  { cat: 'משיכת מזומן', kind: 'expense', words: /משיכה עם קוד|משיכת מזומן|כספומט|משיכה מכספומט|atm/i },
  { cat: 'העברות וביט', kind: 'expense', words: /^bit$|ביט|העברה ב ?bit|paybox|פייבוקס|^העברה ל/i },
  { cat: 'סופר ומזון', kind: 'expense', words: /סופר(?! ?פארם)|שופרסל|רמי לוי|טיב טעם|יוחננוף|ויקטורי|אושר עד|מעדני|אטליז|דגים|מכולת|קצב|ירקות|פירות|ampm|market|מרקט|שוק|יינות ביתן|חצי חינם|מגה|קרפור|carrefour|לנדוור|ביירן|רוסמן|פיצוחי/i },
  { cat: 'מסעדות ובילויים', kind: 'expense', words: /מסעד|מקדונל|בורגר|burger|סושי|sushi|קפה|cafe|ארומה|ארקפה|בר |bar |pub|wolt|וולט|פיצה|pizza|חומוס|שווארמה|פלאפל|גלידה|קונדיט|כנאפה|ממתק|מזנון|סינמה|cinema|יס פלאנט|קולנוע|פאדל|אוכל|מטבח|ביסטרו|בראסרי|taberna|montaditos|eatmytrip|kitchen|grill|bakery|דיזרט|קינוח|מאפייה/i },
  { cat: 'תחבורה ודלק', kind: 'expense', words: /פז|yellow|דלק|סונול|דור אלון|חניו|חניה|רכבת|gett|יאנגו|מונית|אוטובוס|רב.?קו|מנהרות|כביש 6|נתיבי|שטיפת|מוסך|צמיגים|משרד תחבורה|רשיון|אחוזת החוף|פנגו|סלופארק|dynamo|דינמומטר/i },
  { cat: 'בריאות', kind: 'expense', words: /סופר ?פארם|superpharm|דראגסטורס|drugstore|בית מרקחת|פארם|אופטיק|רופא|מרפא|קופת חולים|מכבי|כללית|מאוחדת|לאומית|שיניים|druni/i },
  { cat: 'מנויים', kind: 'expense', words: /netflix|נטפליקס|spotify|ספוטיפיי|apple|icloud|google|youtube|disney|playstation|xbox|steam|chatgpt|openai|claude|anthropic|amazon prime|כושר|הולמס|גו אקטיב|סלקום|פרטנר|בזק|גולן טלקום|we4g|esim/i },
  { cat: 'קניות וביגוד', kind: 'expense', words: /h&m|זארה|zara|קסטרו|fox|פוקס|גולף|אופנ|בוטיק|shein|aliexpress|amazon|איקאה|ikea|ksp|באג|מחסני חשמל|ספורט|בילבונג|טרמינל|duty free|דיוטי|היינמן|שוז|נעלי|מעיין 2000|max 20|מקס סטוק|ace|הום סנטר|אינטר-פט|פט שופ|חיות/i },
  { cat: 'דיור וחשבונות', kind: 'expense', words: /חשמל|מים|ארנונה|גז|ועד בית|שכירות|ביטוח|הפניקס|מגדל|הראל|מנורה|כלל ביטוח|איילון|עירייה|עיריית/i },
  { cat: 'מתנות', kind: 'expense', words: /פרח|מתנ|צעצוע|משתלה/i },
  { cat: 'חינוך', kind: 'expense', words: /ספרים|ספרי |סטימצקי|צומת ספרים|udemy|coursera|אוניברסיט|מכללה|קורס|לימוד/i },
  { cat: 'משכורת', kind: 'income', words: /משכורת|שכר/i },
  { cat: 'החזרים', kind: 'income', words: /זיכוי|החזר|refund/i },
]

// Money moving between your own accounts is neither income nor expense
const INTERNAL = /חיסכון|פיקדון|פקדון|העברה בין חשבונות|העברה לחשבון שלי|קופת גמל|השקע/
const CARD_BILL = /^חיוב בכרטיס$|חיוב כרטיס אשראי|ישראכרט|מקס איט|max it|כאל|ויזה|לאומי קארד|אמריקן אקספרס/i

const merchantKey = (s: string) => s.toLowerCase().replace(/[\d#*"'׳״.,-]+/g, ' ').replace(/\s+/g, ' ').trim()

const PAYMENT_RULES: { name: string; words: RegExp }[] = [
  { name: 'ביט', words: /bit|ביט|paybox|פייבוקס/i },
  { name: 'הוראת קבע', words: /הוראת קבע/ },
  { name: 'מזומן', words: /משיכה עם קוד|משיכת מזומן|כספומט/ },
  { name: 'העברה בנקאית', words: /העברה|צ'ק|שיק/ },
]

export function classify(raw: RawRow[], source: string, categories: Category[], existing: Transaction[], payments: PaymentMethod[] = [], owner: string | null = null): ImportRow[] {
  const paymentByName = (name: string) => payments.find((p) => !p.archived && p.name === name)?.id ?? null
  const paymentFor = (desc: string) => {
    const rule = PAYMENT_RULES.find((r) => r.words.test(desc))
    return paymentByName(rule ? rule.name : 'אשראי') // Pepper card purchases show the merchant directly
  }
  const byName = (kind: Kind, name: string) => categories.find((c) => c.kind === kind && !c.archived && c.name === name)?.id ?? null
  const other = (kind: Kind) => byName(kind, 'אחר') ?? categories.find((c) => c.kind === kind && !c.archived)?.id ?? null

  // What you chose before for the same merchant wins over keyword rules
  const learned = new Map<string, string>()
  for (const t of [...existing].reverse()) {
    if (t.merchant && t.category_id) learned.set(`${t.kind}:${merchantKey(t.merchant)}`, t.category_id)
  }
  const existingIds = new Set(existing.map((t) => t.external_id).filter(Boolean))
  // Manual entries with the same day, amount and direction are probably this same purchase
  const manual = new Set(existing.filter((t) => !t.external_id).map((t) => `${t.occurred_on}|${t.amount}|${t.kind}`))

  const seen = new Map<string, number>()
  return raw.map((r) => {
    const kind: Kind = r.amount < 0 ? 'expense' : 'income'
    const amount = Math.round(Math.abs(r.amount) * 100) / 100
    const base = `${source}:${r.date}:${r.ref}:${r.amount}:${merchantKey(r.description)}`
    const n = (seen.get(base) ?? 0) + 1 // identical rows on the same day stay distinct
    seen.set(base, n)
    const key = n > 1 ? `${base}#${n}` : base

    let categoryId = learned.get(`${kind}:${merchantKey(r.description)}`) ?? null
    if (!categoryId) {
      const rule = RULES.find((x) => x.kind === kind && x.words.test(r.description))
      if (rule) categoryId = byName(kind, rule.cat)
    }

    let flag: ImportRow['flag']
    if (existingIds.has(key)) flag = 'duplicate'
    else if (INTERNAL.test(r.description) || (owner && /^העברה (ל|מ)/.test(r.description) && r.description.includes(owner))) flag = 'internal'
    else if (kind === 'expense' && CARD_BILL.test(r.description)) flag = 'card-bill'
    else if (manual.has(`${r.date}|${amount}|${kind}`)) flag = 'duplicate'

    return {
      key,
      include: flag !== 'duplicate' && flag !== 'internal',
      kind,
      amount,
      date: r.date,
      merchant: r.description,
      categoryId: categoryId ?? other(kind),
      paymentMethodId: kind === 'expense' ? paymentFor(r.description) : null,
      note: flag === 'card-bill' ? 'חיוב כרטיס אשראי (ללא פירוט)' : null,
      flag,
    }
  })
}
