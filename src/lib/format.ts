// Format as "₪1,234" without the bidi control marks Intl adds for he-IL, so amounts
// render the same inside Hebrew text and inside LTR-isolated number spans.
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const dec = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

export const money = (n: number) => `${n < 0 ? '-' : ''}₪${int.format(Math.abs(Math.round(n)))}`
export const moneyExact = (n: number) => `${n < 0 ? '-' : ''}₪${dec.format(Math.abs(n))}`
export const pct = (n: number) => `${Math.round(n * 100)}%`
export const uid = () => crypto.randomUUID()
