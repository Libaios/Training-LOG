import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useChartColors } from '../lib/ui'

type Point = { label: string; value: number; detail?: string }

type ChartProps = {
  data: Point[]
  tone: 'strength' | 'run'
  /** Formate une valeur pour l'infobulle et l'axe. */
  format: (v: number) => string
  height?: number
  /** Inverse l'axe vertical (allure : plus haut = plus rapide). */
  reversed?: boolean
  /** Graduations imposées (ex. allure par pas de 15 s). */
  ticks?: number[]
  summary: string
}

function TooltipBox({
  active,
  payload,
  format,
}: {
  active?: boolean
  payload?: { payload: Point }[]
  format: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="chart-tip">
      <span className="chart-tip-label">{p.label}</span>
      <strong>{format(p.value)}</strong>
      {p.detail && <span className="chart-tip-detail">{p.detail}</span>}
    </div>
  )
}

const axisTick = (color: string) => ({ fill: color, fontSize: 12, fontFamily: 'Barlow, system-ui, sans-serif' })

export function WeeklyBars({ data, tone, format, height = 180, summary }: ChartProps) {
  const c = useChartColors()
  const color = tone === 'strength' ? c.strength : c.run
  return (
    <figure className="chart" aria-label={summary}>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: c.grid }}
            tick={axisTick(c.axis)}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis tickLine={false} axisLine={false} tick={axisTick(c.axis)} width={56} tickFormatter={format} />
          <Tooltip
            cursor={{ fill: c.grid, opacity: 0.5 }}
            content={<TooltipBox format={format} />}
            isAnimationActive={false}
          />
          <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}

export function TrendLine({ data, tone, format, height = 200, reversed, ticks, summary }: ChartProps) {
  const c = useChartColors()
  const color = tone === 'strength' ? c.strength : c.run
  return (
    <figure className="chart" aria-label={summary}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: c.grid }}
            tick={axisTick(c.axis)}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={axisTick(c.axis)}
            width={56}
            tickFormatter={format}
            domain={ticks ? [ticks[0], ticks[ticks.length - 1]] : ['auto', 'auto']}
            ticks={ticks}
            reversed={reversed}
          />
          <Tooltip
            cursor={{ stroke: c.axis, strokeDasharray: '3 3' }}
            content={<TooltipBox format={format} />}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 4, fill: color, stroke: c.surface, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: color, stroke: c.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </figure>
  )
}
