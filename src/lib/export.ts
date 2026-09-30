import { fmtDate } from './dates'
import { periodLabel, totals, type Period } from './finance'
import type { Category, PaymentMethod, Transaction } from './types'

const fileBase = (p: Period) => `nekuda-report_${p.from}_${p.to}`

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

async function snapshot(node: HTMLElement) {
  const { toPng } = await import('html-to-image')
  await document.fonts.ready
  // First call warms up font/image embedding in Safari
  await toPng(node, { pixelRatio: 1, cacheBust: true }).catch(() => {})
  return toPng(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
}

export async function exportPNG(node: HTMLElement, p: Period) {
  const dataUrl = await snapshot(node)
  download(await (await fetch(dataUrl)).blob(), `${fileBase(p)}.png`)
}

/** Hebrew text is rendered as an image of the report so RTL shaping is exact. */
export async function exportPDF(node: HTMLElement, p: Period) {
  const [{ jsPDF }, dataUrl] = await Promise.all([import('jspdf'), snapshot(node)])
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const scale = pageW / img.width
  const sliceH = Math.floor(pageH / scale) // source pixels per page

  // Cut the tall image into page-sized slices
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  const ctx = canvas.getContext('2d')!
  for (let y = 0, page = 0; y < img.height; y += sliceH, page++) {
    const h = Math.min(sliceH, img.height - y)
    canvas.height = h
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, h)
    ctx.drawImage(img, 0, y, img.width, h, 0, 0, img.width, h)
    if (page > 0) pdf.addPage()
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageW, h * scale)
  }
  pdf.setProperties({ title: `נקודה – ${periodLabel(p)}` })
  pdf.save(`${fileBase(p)}.pdf`)
}

export async function exportExcel(txs: Transaction[], p: Period, cats: Map<string, Category>, pays: Map<string, PaymentMethod>) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'נקודה'
  const header = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF7A1F2B' } } }
  const money = '#,##0.00 ₪'

  // Summary
  const sum = totals(txs)
  const s = wb.addWorksheet('סיכום', { views: [{ rightToLeft: true }] })
  s.columns = [{ width: 26 }, { width: 18 }]
  s.addRow([`דוח ${periodLabel(p)}`]).font = { bold: true, size: 16, color: { argb: 'FF7A1F2B' } }
  s.addRow([`${fmtDate(p.from)} – ${fmtDate(p.to)}`])
  s.addRow([])
  for (const [k, v] of [['הכנסות', sum.income], ['הוצאות', sum.expense], ['מאזן', sum.balance]] as const) {
    const r = s.addRow([k, v])
    r.getCell(2).numFmt = money
    r.getCell(1).font = { bold: true }
  }
  const rate = s.addRow(['שיעור חיסכון', sum.savingsRate])
  rate.getCell(2).numFmt = '0%'
  rate.getCell(1).font = { bold: true }

  // By category
  for (const kind of ['expense', 'income'] as const) {
    const rows = byCategoryFull(txs, cats, kind)
    const ws = wb.addWorksheet(kind === 'expense' ? 'הוצאות לפי קטגוריה' : 'הכנסות לפי קטגוריה', { views: [{ rightToLeft: true }] })
    ws.columns = [{ header: 'קטגוריה', width: 24 }, { header: 'סכום', width: 16 }, { header: 'אחוז', width: 10 }, { header: 'מספר תנועות', width: 14 }]
    ws.getRow(1).eachCell((c) => Object.assign(c, header))
    for (const r of rows) {
      const row = ws.addRow([r.name, r.value, r.share, r.count])
      row.getCell(2).numFmt = money
      row.getCell(3).numFmt = '0.0%'
    }
    const tot = ws.addRow(['סה״כ', rows.reduce((a, r) => a + r.value, 0)])
    tot.font = { bold: true }
    tot.getCell(2).numFmt = money
  }

  // All transactions
  const ws = wb.addWorksheet('כל התנועות', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'תאריך', width: 12 }, { header: 'סוג', width: 9 }, { header: 'סכום', width: 14 }, { header: 'קטגוריה', width: 20 },
    { header: 'עסק / מקור', width: 22 }, { header: 'אמצעי תשלום', width: 15 }, { header: 'הערה', width: 30 },
  ]
  ws.getRow(1).eachCell((c) => Object.assign(c, header))
  for (const t of [...txs].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on))) {
    const [y, m, d] = t.occurred_on.split('-').map(Number)
    const row = ws.addRow([
      new Date(Date.UTC(y, m - 1, d)), t.kind === 'income' ? 'הכנסה' : 'הוצאה', t.kind === 'income' ? t.amount : -t.amount,
      cats.get(t.category_id ?? '')?.name ?? '', t.merchant ?? '', pays.get(t.payment_method_id ?? '')?.name ?? '', t.note ?? '',
    ])
    row.getCell(1).numFmt = 'dd/mm/yyyy'
    row.getCell(3).numFmt = money
    row.getCell(3).font = { color: { argb: t.kind === 'income' ? 'FF1D7A4F' : 'FFC0263A' } }
  }
  ws.autoFilter = { from: 'A1', to: 'G1' }

  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${fileBase(p)}.xlsx`)
}

function byCategoryFull(txs: Transaction[], cats: Map<string, Category>, kind: 'expense' | 'income') {
  const counts = new Map<string, number>()
  for (const t of txs) if (t.kind === kind) counts.set(t.category_id ?? 'none', (counts.get(t.category_id ?? 'none') ?? 0) + 1)
  // Full list (no "Other" folding) for the spreadsheet
  const sums = new Map<string, number>()
  for (const t of txs) if (t.kind === kind) sums.set(t.category_id ?? 'none', (sums.get(t.category_id ?? 'none') ?? 0) + t.amount)
  const total = [...sums.values()].reduce((a, b) => a + b, 0)
  return [...sums.entries()].sort((a, b) => b[1] - a[1]).map(([id, value]) => ({
    name: cats.get(id)?.name ?? 'ללא קטגוריה', value, share: total ? value / total : 0, count: counts.get(id) ?? 0,
  }))
}

