import type { ElementType, ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Search,
  Bot,
  Brain,
  BookTemplate,
  ClipboardList,
  BarChart2,
  Bell,
  Settings,
  LogOut,
  Zap,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { authApi, connectionsApi, usersApi } from '../../lib/api';
import { calculateProfileCompletion } from '../../lib/profileCompletion';

const MAIN_NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/scraper', icon: Search, label: 'Find Projects', end: false },
  { to: '/automation', icon: Bot, label: 'Automation', end: false },
  { to: '/ai-analyze', icon: Brain, label: 'AI Analyze', end: false },
];

const WORKSPACE_NAV = [
  { to: '/instructions', icon: BookTemplate, label: 'Instructions', end: false },
  { to: '/records', icon: ClipboardList, label: 'Records', end: false },
  { to: '/analytics', icon: BarChart2, label: 'Analytics', end: false },
  { to: '/alerts', icon: Bell, label: 'Alerts', end: false },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 select-none">
      {children}
    </p>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string;
  icon: ElementType;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        clsx(
          'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-primary/15 text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
            : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={clsx(
              'flex h-5 w-5 flex-shrink-0 items-center justify-center transition-colors',
              isActive ? 'text-primary' : 'text-slate-500 group-hover:text-slate-300',
            )}
          >
            <Icon size={16} strokeWidth={1.85} />
          </span>
          <span className="flex-1 leading-none">{label}</span>
          {isActive ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const { data: profileData } = useQuery({ queryKey: ['user-profile'], queryFn: usersApi.getProfile });
  const { data: connectionStatus } = useQuery({
    queryKey: ['platform-connections-status'],
    queryFn: connectionsApi.status,
  });

  const completion = calculateProfileCompletion(
    user,
    profileData?.profile,
    Number(Boolean(connectionStatus?.upwork)) + Number(Boolean(connectionStatus?.freelancer)),
  );
  const initial = user?.name?.charAt(0).toUpperCase() ?? '?';
  const displayName = user?.name ?? 'My Profile';

  async function handleLogout() {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout API failures and still clear local session state.
    }
    logout();
    navigate('/login');
  }

  return (
    <aside className="app-sidebar w-[232px] h-full shrink-0 border-r border-white/5 bg-dark text-slate-300 shadow-[8px_0_30px_rgba(0,0,0,0.12)] overflow-hidden">
      <div className="flex h-full min-h-0 flex-col">
        <div className="shrink-0 px-4 pt-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
              <Zap size={18} strokeWidth={2.1} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold tracking-[-0.02em] text-slate-100">
                FreelanceOS
              </p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.34em] text-slate-500">
                WORKSPACE
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-4 pt-5 pb-4">
          <div className="border-t border-white/10" />
          <div className="flex flex-col items-center px-2 pt-5 text-center">
            <Link
              to="/profile"
              aria-label="Open profile"
              className="group flex flex-col items-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-0"
            >
              <div className="rounded-full border-[4px] border-slate-500/60 bg-slate-700/30 p-1 transition-colors group-hover:border-slate-400/70">
                <div className="flex h-[68px] w-[68px] items-center justify-center overflow-hidden rounded-full bg-slate-800">
                  {user?.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={user.name ?? 'Profile avatar'}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-[26px] font-bold leading-none text-primary">
                      {initial}
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/15 px-3 py-1 text-[11px] font-semibold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span>{completion}%</span>
              </div>

              <p className="mt-3 text-base font-semibold leading-none text-slate-100 transition-colors group-hover:text-primary">
                {displayName}
              </p>
            </Link>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <div className="space-y-5">
            <div>
              <SectionLabel>Main</SectionLabel>
              <div className="space-y-1">
                {MAIN_NAV.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </div>

            <div>
              <SectionLabel>Workspace</SectionLabel>
              <div className="space-y-1">
                {WORKSPACE_NAV.map((item) => (
                  <NavItem key={item.to} {...item} />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-4 pb-4 pt-2">
          <div className="border-t border-white/10" />
          <div className="mt-3 space-y-1">
            <NavItem to="/settings" icon={Settings} label="Settings" />

            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition-all duration-150 hover:bg-white/5 hover:text-slate-100"
            >
              <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-slate-500 transition-colors">
                <LogOut size={16} strokeWidth={1.85} />
              </span>
              <span className="flex-1 text-left leading-none">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
