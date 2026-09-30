// Nightly bank sync (run by .github/workflows/bank-sync.yml).
// 1. Fetch connections (encrypted) from the bank-sync edge function
// 2. Decrypt each one's credentials with the private key from NEKUDA_SYNC_SECRET
// 3. Scrape recent transactions with israeli-bank-scrapers
// 4. Categorize with the app's own rules (src/lib/bankImport.ts) and report back
import { CompanyTypes, createScraper } from 'israeli-bank-scrapers'
import { classify, type RawRow } from '../src/lib/bankImport.ts'
import { companyById } from '../src/lib/bankCompanies.ts'
import type { Category, PaymentMethod, Transaction } from '../src/lib/types.ts'
import { openSealed, readWorkerSecret } from './crypto.ts'

type Connection = { id: string; user_id: string; company: string; encrypted_credentials: string; last_success_at: string | null }
type UserContext = { categories: Category[]; payment_methods: PaymentMethod[]; transactions: Transaction[] }

const FIRST_SYNC_DAYS = 90 // how far back the first sync of a new connection goes
const OVERLAP_DAYS = 10 // re-read a few days before the last success; duplicates are ignored

const secret = readWorkerSecret(process.env.NEKUDA_SYNC_SECRET)

async function api<T>(body: unknown): Promise<T> {
  const res = await fetch(secret.u, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-token': secret.t },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`bank-sync ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

// Scrapers return ISO timestamps at Israel midnight; keep the Israeli calendar date
const israelDate = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

const ERRORS: Record<string, string> = {
  INVALID_PASSWORD: 'שם המשתמש או הסיסמה שגויים. יש לעדכן את פרטי ההתחברות',
  CHANGE_PASSWORD: 'הבנק מבקש להחליף סיסמה. יש להיכנס לאתר הבנק, להחליף, ולעדכן כאן',
  ACCOUNT_BLOCKED: 'החשבון באתר הבנק חסום',
  TIMEOUT: 'אתר הבנק לא הגיב בזמן. ננסה שוב בלילה הבא',
  TWO_FACTOR_RETRIEVER_MISSING: 'הבנק דורש קוד אימות, ולכן אי אפשר לעדכן אוטומטית',
}

async function syncOne(conn: Connection, ctx: UserContext, hasCard: boolean) {
  const company = companyById(conn.company)
  if (!company || !(Object.values(CompanyTypes) as string[]).includes(conn.company)) throw new Error('בנק לא נתמך')
  const credentials = openSealed(secret.k, conn.encrypted_credentials)

  const since = conn.last_success_at
    ? new Date(new Date(conn.last_success_at).getTime() - OVERLAP_DAYS * 864e5)
    : new Date(Date.now() - FIRST_SYNC_DAYS * 864e5)

  const scraper = createScraper({
    companyId: conn.company as CompanyTypes,
    startDate: since,
    combineInstallments: false,
    showBrowser: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultTimeout: 60_000,
  })
  const result = await scraper.scrape(credentials as never)
  if (!result.success) {
    throw new Error(ERRORS[result.errorType ?? ''] ?? `שגיאה מהבנק: ${result.errorMessage ?? result.errorType ?? 'לא ידועה'}`)
  }

  const out: Record<string, unknown>[] = []
  for (const account of result.accounts ?? []) {
    const txns = account.txns.filter((t) => t.status === 'completed' && t.chargedAmount)
    const raw: RawRow[] = txns
      .map((t) => ({
        // Installments share the purchase date, so each one is dated by its own charge
        date: israelDate(t.installments ? t.processedDate : t.date),
        description: t.description,
        amount: t.chargedAmount,
        ref: `${t.identifier ?? ''}${t.installments ? `/${t.installments.number}` : ''}`,
      }))

    const source = `${conn.company}:${account.accountNumber}`
    // Anything already in the app from another source (manual entry or a file import) on the
    // same day, amount and direction is treated as the same transaction
    const elsewhere = new Set(ctx.transactions
      .filter((t) => !t.external_id?.startsWith(`${source}:`))
      .map((t) => `${t.occurred_on}|${t.amount}|${t.kind}`))

    // classify() returns one row per input row, in the same order
    const rows = classify(raw, source, ctx.categories, ctx.transactions, ctx.payment_methods)
    rows.forEach((r, i) => {
      if (r.flag === 'duplicate' || r.flag === 'internal') return
      if (r.flag === 'card-bill' && hasCard) return // the card itself is synced, so skip its monthly bill
      if (elsewhere.has(`${r.date}|${r.amount}|${r.kind}`)) return
      const inst = txns[i].installments
      out.push({
        kind: r.kind, amount: r.amount, occurred_on: r.date, merchant: r.merchant, category_id: r.categoryId,
        payment_method_id: r.paymentMethodId, external_id: r.key,
        note: inst ? `תשלום ${inst.number} מתוך ${inst.total}` : r.note,
      })
    })
  }
  return out
}

async function main() {
  const { connections, users } = await api<{ connections: Connection[]; users: Record<string, UserContext> }>({ action: 'list' })
  console.log(`${connections.length} connection(s)`)
  let failures = 0
  for (const conn of connections) {
    const ctx = users[conn.user_id]
    const hasCard = connections.some((c) => c.user_id === conn.user_id && companyById(c.company)?.kind === 'card')
    const label = `${conn.company} (${conn.id.slice(0, 8)})`
    try {
      const rows = await syncOne(conn, ctx, hasCard)
      const res = await api<{ added: number }>({ action: 'report', connection_id: conn.id, ok: true, rows })
      console.log(`✓ ${label}: ${rows.length} fetched, ${res.added} new`)
    } catch (e) {
      failures++
      const message = (e as Error).message
      // Never log credentials; error messages come from our own mapping or the scraper
      console.error(`✗ ${label}: ${message}`)
      await api({ action: 'report', connection_id: conn.id, ok: false, error: message }).catch(() => {})
    }
  }
  if (failures) console.log(`${failures} connection(s) failed`)
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
