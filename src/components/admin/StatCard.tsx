import { TrendingDown, TrendingUp } from 'lucide-react'

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  trend?: number
}

export default function StatCard({ icon, label, value, trend }: StatCardProps) {
  const trendUp = trend !== undefined && trend >= 0

  return (
    <div
      className="rounded-xl p-4 glass backdrop-blur-md"
      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <span className="text-xl">{icon}</span>
        {trend !== undefined && (
          <span
            className="flex items-center gap-0.5 text-xs font-inter"
            style={{ color: trendUp ? '#4ade80' : '#f87171' }}
          >
            {trendUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <p className="font-cinzel text-2xl font-bold text-gold mb-1">{value}</p>
      <p className="font-inter text-xs text-foreground/50">{label}</p>
    </div>
  )
}
