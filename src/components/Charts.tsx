import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money, pct } from '../lib/format'
import type { Slice } from '../lib/finance'

type TipPayload = { payload?: Record<string, unknown>; name?: string; value?: number; color?: string; dataKey?: string }

export function Donut({ slices, total, label = 'סה״כ הוצאות', selected, onSelect, size = 240, animate = true }: {
  slices: Slice[]; total: number; label?: string; selected?: string | null; onSelect?: (id: string | null) => void; size?: number; animate?: boolean
}) {
  const [hover, setHover] = useState<number | null>(null)
  const active = hover ?? (selected ? slices.findIndex((s) => s.id === selected) : -1)
  const focus = active >= 0 ? slices[active] : null

  return (
    <div className="donut-wrap" style={{ width: '100%', maxWidth: size, height: size, margin: '0 auto' }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={slices} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="96%"
            startAngle={90} endAngle={-270} stroke="var(--surface)" strokeWidth={2} cornerRadius={4}
            isAnimationActive={animate} animationDuration={700}
            onMouseEnter={(_, i) => setHover(i)} onMouseLeave={() => setHover(null)}
            onClick={(_, i) => onSelect?.(slices[i].id === selected ? null : slices[i].id)}
          >
            {slices.map((s, i) => (
              <Cell key={s.id} fill={s.color} opacity={active >= 0 && active !== i ? 0.35 : 1} style={{ cursor: onSelect ? 'pointer' : 'default', transition: 'opacity .2s' }} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="donut-center">
        <div>
          <div className="k">{focus ? `${focus.icon} ${focus.name}` : label}</div>
          <div className="v num">{money(focus ? focus.value : total)}</div>
          {focus && <div className="k">{pct(focus.share)}</div>}
        </div>
      </div>
    </div>
  )
}

export function Legend({ slices, selected, onSelect }: { slices: Slice[]; selected?: string | null; onSelect?: (id: string | null) => void }) {
  return (
    <div className="legend">
      {slices.map((s) => (
        <button key={s.id} className={`legend-row ${selected === s.id ? 'on' : ''}`} onClick={() => onSelect?.(selected === s.id ? null : s.id)} type="button">
          <span className="sw" style={{ background: s.color }} />
          <span className="nm">{s.icon} {s.name}</span>
          <span className="num" style={{ fontWeight: 600 }}>{money(s.value)}</span>
          <span className="pc num">{pct(s.share)}</span>
        </button>
      ))}
    </div>
  )
}

function IncomeExpenseTip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { label: string; income: number; expense: number }
  return (
    <div className="chart-tip">
      <div className="t">{row.label}</div>
      <div className="r"><span><i style={{ background: 'var(--c-income)' }} /> הכנסות</span><b className="num">{money(row.income)}</b></div>
      <div className="r"><span><i style={{ background: 'var(--c-expense)' }} /> הוצאות</span><b className="num">{money(row.expense)}</b></div>
      <div className="r muted"><span>מאזן</span><span className="num">{money(row.income - row.expense)}</span></div>
    </div>
  )
}

export function IncomeExpenseBars({ rows, height = 240, animate = true }: {
  rows: { label: string; income: number; expense: number }[]; height?: number; animate?: boolean
}) {
  const many = rows.length > 16
  return (
    <div>
      <div className="row small text-2" style={{ gap: 16, marginBottom: 8 }}>
        <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--c-income)' }} /> הכנסות</span>
        <span className="row" style={{ gap: 6 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--c-expense)' }} /> הוצאות</span>
      </div>
      <div style={{ width: '100%', height, direction: 'ltr' }}>
        <ResponsiveContainer>
          <BarChart data={rows} barGap={2} barCategoryGap={many ? '18%' : '28%'} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} reversed />
            <YAxis orientation="right" tickLine={false} axisLine={false} width={48} tick={{ fill: 'var(--muted)', fontSize: 11 }}
              tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v))} />
            <Tooltip content={<IncomeExpenseTip />} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="income" fill="var(--c-income)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
            <Bar dataKey="expense" fill="var(--c-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RateTip({ active, payload }: { active?: boolean; payload?: TipPayload[] }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload as { label: string; rate: number; done: number; total: number }
  return (
    <div className="chart-tip">
      <div className="t">{row.label}</div>
      <div className="num">{pct(row.rate)} · {row.done}/{row.total}</div>
    </div>
  )
}

export function RateBars({ rows, height = 200 }: { rows: { label: string; rate: number; done: number; total: number }[]; height?: number }) {
  return (
    <div style={{ width: '100%', height, direction: 'ltr' }}>
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} reversed />
          <YAxis orientation="right" domain={[0, 1]} ticks={[0, 0.5, 1]} tickFormatter={(v: number) => pct(v)} tickLine={false} axisLine={false} width={40} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
          <Tooltip content={<RateTip />} cursor={{ fill: 'var(--surface-2)' }} />
          <Bar dataKey="rate" fill="var(--c1)" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
