import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  FileText, TrendingUp, DollarSign, Bell, Calendar, Trophy, ChevronLeft, ChevronRight, Newspaper,
} from 'lucide-react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNow,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import clsx from 'clsx';

const STATUS_CLASSES: Record<string, string> = {
  won: 'badge-success',
  lost: 'badge-danger',
  pending: 'badge-warning',
  no_response: 'badge-gray',
};

const STATUS_LABELS: Record<string, string> = {
  won: 'Won',
  lost: 'Lost',
  pending: 'Pending',
  no_response: 'No Response',
};

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: analyticsApi.getDashboard,
  });

  const { data: timeline = [] } = useQuery({
    queryKey: ['analytics', 'timeline'],
    queryFn: () => analyticsApi.getTimeline(30),
  });

  const monthKey = format(calendarCursor, 'yyyy-MM');

  const { data: activityCalendar } = useQuery({
    queryKey: ['analytics', 'activity-calendar', monthKey],
    queryFn: () => analyticsApi.getActivityCalendar(monthKey),
  });

  const { data: liveFeed, isLoading: isFeedLoading } = useQuery({
    queryKey: ['analytics', 'live-feed'],
    queryFn: analyticsApi.getLiveFeed,
    staleTime: 60 * 1000,
    refetchInterval: 4 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  const statCards = [
    {
      label: 'Total Proposals',
      value: stats?.totalProposals ?? 0,
      icon: FileText,
      color: 'text-primary bg-primary/10',
    },
    {
      label: 'Won',
      value: stats?.wonProposals ?? 0,
      icon: Trophy,
      color: 'text-success bg-success/10',
    },
    {
      label: 'Win Rate',
      value: `${stats?.winRate ?? 0}%`,
      icon: TrendingUp,
      color: 'text-accent bg-accent/10',
    },
    {
      label: 'Avg Bid',
      value: `$${stats?.avgBidAmount ?? 0}`,
      icon: DollarSign,
      color: 'text-warning bg-warning/10',
    },
    {
      label: 'This Week',
      value: stats?.proposalsThisWeek ?? 0,
      icon: Calendar,
      color: 'text-primary bg-primary/10',
    },
    {
      label: 'Active Alerts',
      value: stats?.activeAlerts ?? 0,
      icon: Bell,
      color: 'text-danger bg-danger/10',
    },
  ];

  const chartData = timeline.map((d: { date: string; proposals: number; won: number }) => ({
    ...d,
    date: format(parseISO(d.date), 'MMM d'),
  }));

  const dayMap = useMemo(() => {
    const map = new Map<string, { proposals: number; platforms: string[] }>();
    const days = Array.isArray(activityCalendar?.days) ? activityCalendar.days : [];
    days.forEach((day: { date: string; proposals: number; platforms?: string[] }) => {
      map.set(day.date, {
        proposals: day.proposals,
        platforms: day.platforms ?? [],
      });
    });
    return map;
  }, [activityCalendar]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(calendarCursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(calendarCursor), { weekStartsOn: 1 });

    return eachDayOfInterval({ start, end }).map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const activity = dayMap.get(key);

      return {
        date: day,
        dateKey: key,
        proposals: activity?.proposals ?? 0,
        platforms: activity?.platforms ?? [],
      };
    });
  }, [calendarCursor, dayMap]);

  const maxProposalsInMonth = useMemo(
    () => Math.max(...calendarDays.map((d) => d.proposals), 1),
    [calendarDays],
  );

  const selectedDayDetails = selectedDate ? dayMap.get(selectedDate) : null;

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">
          Good {getGreeting()}, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-slate-500 mt-0.5">Here's your freelance activity overview</p>
      </div>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="w-8 h-8 bg-slate-100 rounded-lg mb-3" />
              <div className="h-6 bg-slate-100 rounded mb-1 w-12" />
              <div className="h-3 bg-slate-100 rounded w-20" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {statCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="card p-4 hover:-translate-y-0.5 hover:shadow-md">
              <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center mb-3', color)}>
                <Icon size={18} />
              </div>
              <p className="text-xl font-bold text-dark">{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Timeline Chart */}
          <div className="card p-5 hover:shadow-md">
            <h2 className="font-semibold text-dark mb-4">Proposals of Last 30 Days</h2>
            {chartData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                No proposal data yet. Start sending proposals to see trends.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f8fafc', fontSize: 12 }}
                    cursor={{ stroke: '#1A56DB', strokeWidth: 1, strokeDasharray: '4 2' }}
                  />
                  <Line type="monotone" dataKey="proposals" stroke="#1A56DB" strokeWidth={2} dot={false} name="Proposals" />
                  <Line type="monotone" dataKey="won" stroke="#10B981" strokeWidth={2} dot={false} name="Won" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Activity Calendar */}
          <div className="card p-5 hover:shadow-md">
            <div className="flex items-center justify-between mb-4 gap-2">
              <div>
                <h2 className="font-semibold text-dark">Activity Calendar</h2>
                <p className="text-xs text-slate-500 mt-0.5">Daily proposal activity from your records</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCalendarCursor((prev) => subMonths(prev, 1))}
                  className="btn-secondary !px-2.5 !py-1.5"
                  aria-label="Previous month"
                >
                  <ChevronLeft size={14} />
                </button>
                <p className="text-sm font-medium text-dark min-w-24 text-center">
                  {format(calendarCursor, 'MMM yyyy')}
                </p>
                <button
                  type="button"
                  onClick={() => setCalendarCursor((prev) => addMonths(prev, 1))}
                  className="btn-secondary !px-2.5 !py-1.5"
                  aria-label="Next month"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-[11px] text-slate-400 mb-2">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <p key={day} className="text-center py-1">{day}</p>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const intensity = day.proposals / maxProposalsInMonth;
                const inCurrentMonth = isSameMonth(day.date, calendarCursor);
                const isSelected = selectedDate === day.dateKey;

                const activityClass = day.proposals === 0
                  ? 'bg-slate-100/80 border-slate-200'
                  : intensity < 0.34
                    ? 'bg-blue-100 border-blue-200'
                    : intensity < 0.67
                      ? 'bg-blue-200 border-blue-300'
                      : 'bg-blue-300 border-blue-400';

                const tooltip = `${format(day.date, 'MMM d')}: ${day.proposals} Proposals${day.platforms.length ? ` | ${day.platforms.join(', ')}` : ''}`;

                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    title={tooltip}
                    onClick={() => setSelectedDate(day.dateKey)}
                    className={clsx(
                      'h-9 rounded-md border text-xs relative transition-all',
                      inCurrentMonth ? 'text-dark' : 'text-slate-300',
                      activityClass,
                      isToday(day.date) && 'ring-1 ring-primary/60',
                      isSelected && 'ring-2 ring-primary/50',
                    )}
                  >
                    {format(day.date, 'd')}
                    {day.proposals > 0 && (
                      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>

            {selectedDate && (
              <div className="mt-4 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-xs text-slate-600">
                <p className="font-medium text-dark">{format(parseISO(selectedDate), 'EEEE, MMM d')}</p>
                <p className="mt-0.5">{selectedDayDetails?.proposals ?? 0} Proposals</p>
                {!!selectedDayDetails?.platforms?.length && (
                  <p className="mt-0.5 text-slate-500">Platforms: {selectedDayDetails.platforms.join(', ')}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {/* Recent Proposals */}
          <div className="card p-5 hover:shadow-md">
            <h2 className="font-semibold text-dark mb-4">Recent Proposals</h2>
            {!stats?.recentProposals?.length ? (
              <p className="text-slate-400 text-sm">No proposals yet.</p>
            ) : (
              <div className="space-y-3">
                {stats.recentProposals.map((p: {
                  id: string;
                  projectTitle: string;
                  status: string;
                  bidAmount: number;
                  platform: string;
                  createdAt: string;
                }) => (
                  <div key={p.id} className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-dark truncate">{p.projectTitle}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {p.platform} · ${p.bidAmount}
                      </p>
                    </div>
                    <span className={clsx('badge flex-shrink-0', STATUS_CLASSES[p.status])}>
                      {STATUS_LABELS[p.status]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Tech Feed */}
          <div className="card p-5 hover:shadow-md">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Newspaper size={16} />
                </div>
                <div>
                  <h2 className="font-semibold text-dark">Live Tech Feed</h2>
                  <p className="text-xs text-slate-500">Trending in AI and tech</p>
                </div>
              </div>
              {liveFeed?.updatedAt && (
                <span className="text-[11px] text-slate-400">
                  {formatDistanceToNow(new Date(liveFeed.updatedAt), { addSuffix: true })}
                </span>
              )}
            </div>

            {isFeedLoading ? (
              <div className="space-y-2.5">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="animate-pulse">
                    <div className="h-3.5 bg-slate-100 rounded w-5/6" />
                    <div className="h-3 bg-slate-100 rounded w-full mt-1.5" />
                  </div>
                ))}
              </div>
            ) : !liveFeed?.items?.length ? (
              <p className="text-slate-400 text-sm">No live updates right now.</p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {liveFeed.items.map((item: { title: string; snippet: string; source: string; url: string; publishedAt: string }) => (
                  <a
                    key={item.url}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-slate-200/80 bg-white/70 p-3 hover:border-primary/40 hover:bg-white transition-colors"
                  >
                    <p className="text-sm font-medium text-dark leading-snug">{item.title}</p>
                    <p
                      className="text-xs text-slate-500 mt-1 leading-5"
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {item.snippet}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      {item.source} · {formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true })}
                    </p>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}
