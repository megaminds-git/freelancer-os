import { useQuery } from '@tanstack/react-query';
import { analyticsApi, recordsApi } from '../lib/api';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, BarChart, Bar, Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { TrendingUp, BarChart2, Clock, Globe } from 'lucide-react';
import clsx from 'clsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) =>
  i === 0 ? '12am' : i < 12 ? `${i}am` : i === 12 ? '12pm' : `${i - 12}pm`,
);

function heatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return 'bg-slate-100';
  const pct = value / max;
  if (pct < 0.2) return 'bg-primary/10';
  if (pct < 0.4) return 'bg-primary/25';
  if (pct < 0.6) return 'bg-primary/45';
  if (pct < 0.8) return 'bg-primary/65';
  return 'bg-primary/90';
}

export default function Analytics() {
  const { data: timeline = [], isLoading: timelineLoading } = useQuery({
    queryKey: ['analytics', 'timeline', 30],
    queryFn: () => analyticsApi.getTimeline(30),
  });

  const { data: heatmapData } = useQuery({
    queryKey: ['analytics', 'heatmap'],
    queryFn: analyticsApi.getHeatmap,
  });

  const { data: stats } = useQuery({
    queryKey: ['records-stats'],
    queryFn: recordsApi.getStats,
  });

  const chartData = timeline.map((d: { date: string; proposals: number; won: number }) => ({
    ...d,
    date: format(parseISO(d.date), 'MMM d'),
  }));

  const heatmap: number[][] = heatmapData?.heatmap ?? [];
  const maxHeat = heatmap.length
    ? Math.max(...heatmap.flatMap((row: number[]) => row))
    : 0;

  // Compact heatmap: only show hours 6am–11pm
  const visibleHours = Array.from({ length: 18 }, (_, i) => i + 6);

  const platformData = stats?.byPlatform?.map((p: { platform: string; total: number; won: number; winRate: number }) => ({
    name: p.platform,
    Total: p.total,
    Won: p.won,
    'Win %': p.winRate,
  })) ?? [];

  const countryData = stats?.byCountry?.slice(0, 8).map((c: { country: string; total: number; won: number; winRate: number }) => ({
    name: c.country.length > 12 ? c.country.slice(0, 12) + '…' : c.country,
    Total: c.total,
    Won: c.won,
  })) ?? [];

  return (
    <div className="page-shell">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark flex items-center gap-2">
          <BarChart2 size={22} className="text-primary" /> Analytics
        </h1>
        <p className="text-slate-500 mt-0.5">Proposal performance, timing patterns, and win rates</p>
      </div>

      {/* Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Proposals', value: stats.total, color: 'text-dark' },
            { label: 'Won', value: stats.won, color: 'text-success' },
            { label: 'Win Rate', value: `${stats.winRate}%`, color: 'text-primary' },
            { label: 'Avg Bid', value: `$${stats.avgBidAmount ?? 0}`, color: 'text-warning' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4">
              <p className={clsx('text-2xl font-bold', color)}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-dark mb-4 flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" /> Proposal Timeline — Last 30 Days
        </h2>
        {timelineLoading ? (
          <div className="h-48 bg-slate-50 rounded-xl animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
            No data yet. Start sending proposals to see trends here.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
                cursor={{ stroke: '#1A56DB', strokeWidth: 1, strokeDasharray: '4 2' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="proposals" stroke="#1A56DB" strokeWidth={2} dot={false} name="Proposals" />
              <Line type="monotone" dataKey="won" stroke="#10B981" strokeWidth={2} dot={false} name="Won" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Heatmap */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-dark mb-1 flex items-center gap-2">
          <Clock size={16} className="text-primary" /> Activity Heatmap
        </h2>
        <p className="text-xs text-slate-400 mb-4">Proposal submissions by day and hour (UTC)</p>

        {heatmap.length === 0 ? (
          <div className="h-32 flex items-center justify-center text-slate-400 text-sm">
            No heatmap data yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="w-10 text-slate-400 font-normal text-right pr-2" />
                  {visibleHours.map((h) => (
                    <th key={h} className="text-slate-400 font-normal text-center px-0.5" style={{ minWidth: 28 }}>
                      {HOURS[h]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((day, dayIdx) => (
                  <tr key={day}>
                    <td className="text-slate-500 text-right pr-2 py-0.5 font-medium">{day}</td>
                    {visibleHours.map((hour) => {
                      const val = heatmap[dayIdx]?.[hour] ?? 0;
                      return (
                        <td key={hour} className="px-0.5 py-0.5">
                          <div
                            title={`${day} ${HOURS[hour]}: ${val} proposal${val !== 1 ? 's' : ''}`}
                            className={clsx(
                              'w-6 h-6 rounded-sm mx-auto transition-colors',
                              heatColor(val, maxHeat),
                            )}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex items-center gap-2 mt-3 justify-end">
              <span className="text-xs text-slate-400">Less</span>
              {['bg-slate-100', 'bg-primary/10', 'bg-primary/25', 'bg-primary/45', 'bg-primary/65', 'bg-primary/90'].map((c) => (
                <div key={c} className={clsx('w-4 h-4 rounded-sm', c)} />
              ))}
              <span className="text-xs text-slate-400">More</span>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Platform */}
        <div className="card p-5">
          <h2 className="font-semibold text-dark mb-4 flex items-center gap-2">
            <BarChart2 size={16} className="text-primary" /> Win Rate by Platform
          </h2>
          {platformData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No platform data yet.</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={platformData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
                />
                <Bar dataKey="Total" fill="#1A56DB" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Won" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By Country */}
        <div className="card p-5">
          <h2 className="font-semibold text-dark mb-4 flex items-center gap-2">
            <Globe size={16} className="text-primary" /> Top Client Countries
          </h2>
          {countryData.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400 text-sm">No country data yet.</div>
          ) : (
            <div className="space-y-2">
              {stats?.byCountry?.slice(0, 8).map((c: { country: string; total: number; won: number; winRate: number }) => (
                <div key={c.country} className="flex items-center gap-3">
                  <span className="text-sm text-dark w-28 truncate flex-shrink-0">{c.country}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min((c.total / (stats?.total || 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 text-xs">
                    <span className="text-slate-500">{c.total}</span>
                    <span className={clsx(
                      'font-medium',
                      c.winRate >= 30 ? 'text-success' : c.winRate >= 10 ? 'text-warning' : 'text-slate-400',
                    )}>
                      {c.winRate}% win
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
