// Banks and card companies supported by israeli-bank-scrapers, with the login fields each needs.
// Shared by the app (connect form) and the nightly worker (sync/).
export type LoginField = 'username' | 'userCode' | 'id' | 'num' | 'card6Digits' | 'nationalID' | 'password'

export type BankCompany = { id: string; name: string; kind: 'bank' | 'card'; fields: LoginField[] }

export const BANK_COMPANIES: BankCompany[] = [
  { id: 'visaCal', name: 'כאל (Visa Cal)', kind: 'card', fields: ['username', 'password'] },
  { id: 'max', name: 'מקס (Max)', kind: 'card', fields: ['username', 'password'] },
  { id: 'isracard', name: 'ישראכרט', kind: 'card', fields: ['id', 'card6Digits', 'password'] },
  { id: 'amex', name: 'אמריקן אקספרס', kind: 'card', fields: ['id', 'card6Digits', 'password'] },
  { id: 'hapoalim', name: 'בנק הפועלים', kind: 'bank', fields: ['userCode', 'password'] },
  { id: 'leumi', name: 'בנק לאומי', kind: 'bank', fields: ['username', 'password'] },
  { id: 'discount', name: 'בנק דיסקונט', kind: 'bank', fields: ['id', 'password', 'num'] },
  { id: 'mizrahi', name: 'מזרחי טפחות', kind: 'bank', fields: ['username', 'password'] },
  { id: 'beinleumi', name: 'הבינלאומי', kind: 'bank', fields: ['username', 'password'] },
  { id: 'mercantile', name: 'מרכנתיל', kind: 'bank', fields: ['id', 'password', 'num'] },
  { id: 'yahav', name: 'בנק יהב', kind: 'bank', fields: ['username', 'nationalID', 'password'] },
  { id: 'otsarHahayal', name: 'אוצר החייל', kind: 'bank', fields: ['username', 'password'] },
  { id: 'massad', name: 'בנק מסד', kind: 'bank', fields: ['username', 'password'] },
  { id: 'union', name: 'בנק איגוד', kind: 'bank', fields: ['username', 'password'] },
  { id: 'pagi', name: 'בנק פאג"י', kind: 'bank', fields: ['username', 'password'] },
]

export const FIELD_LABELS: Record<LoginField, string> = {
  username: 'שם משתמש',
  userCode: 'קוד משתמש',
  id: 'תעודת זהות',
  num: 'קוד מזהה / מספר',
  card6Digits: '6 ספרות אחרונות של הכרטיס',
  nationalID: 'תעודת זהות',
  password: 'סיסמה',
}

export const companyById = (id: string) => BANK_COMPANIES.find((c) => c.id === id)
