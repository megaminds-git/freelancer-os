import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, ChevronDown } from 'lucide-react';
import { recordsApi, proposalsApi } from '../lib/api';
import type { Proposal, ProposalStatus } from '@freelancer-os/shared';
import { format, parseISO } from 'date-fns';
import clsx from 'clsx';

const STATUS_OPTIONS: ProposalStatus[] = ['pending', 'won', 'lost', 'no_response'];
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  won: 'Won',
  lost: 'Lost',
  no_response: 'No Response',
};

type ProjectContextMeta = {
  projectUrl?: string | null;
  budget?: string | null;
  bidCount?: number | null;
  generationMode?: 'auto' | 'instruction' | 'ai' | null;
  selectedInstruction?: {
    id?: string;
    title?: string;
  } | null;
  clientVerification?: {
    paymentVerified?: boolean;
    emailVerified?: boolean;
    phoneVerified?: boolean;
  };
};

function extractContext(description: string): { plainDescription: string; meta: ProjectContextMeta | null } {
  const marker = '[PROJECT_CONTEXT]';
  const idx = description.lastIndexOf(marker);
  if (idx === -1) return { plainDescription: description, meta: null };

  const plainDescription = description.slice(0, idx).trimEnd();
  const jsonPart = description.slice(idx + marker.length).trim();

  try {
    return { plainDescription, meta: JSON.parse(jsonPart) as ProjectContextMeta };
  } catch {
    return { plainDescription: description, meta: null };
  }
}

export default function Records() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['records', statusFilter],
    queryFn: () => recordsApi.list({ status: statusFilter || undefined }),
  });

  const { data: stats } = useQuery({
    queryKey: ['records-stats'],
    queryFn: recordsApi.getStats,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      proposalsApi.updateStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['records'] });
      qc.invalidateQueries({ queryKey: ['records-stats'] });
    },
  });

  const proposals: Proposal[] = data?.records ?? data?.proposals ?? [];

  function handleExportCsv() {
    recordsApi.exportCsv().then((res) => {
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'records.csv';
      a.click();
    });
  }

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Records</h1>
          <p className="text-slate-500 mt-0.5">Unified proposal history and project context database</p>
        </div>
        <button onClick={handleExportCsv} className="btn-secondary text-xs px-3 py-2">
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total', value: stats.total ?? stats.totalProposals ?? 0, color: 'text-dark' },
            { label: 'Won', value: stats.won ?? stats.wonProposals ?? 0, color: 'text-success' },
            { label: 'Win Rate', value: `${stats.winRate}%`, color: 'text-primary' },
            { label: 'Pending', value: stats.pending ?? 0, color: 'text-warning' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card p-4">
              <p className={clsx('text-2xl font-bold', color)}>{value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {['', ...STATUS_OPTIONS].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              statusFilter === s ? 'bg-primary text-white' : 'text-slate-500 hover:text-dark',
            )}
          >
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading records...</div>
        ) : proposals.length === 0 ? (
          <div className="p-12 text-center text-slate-400">No records found.</div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                {['Project', 'Platform', 'Country', 'Budget', 'Bids', 'Mode', 'Instruction', 'Client Details', 'Bid', 'Status', 'Submitted'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {proposals.map((p) => {
                const { plainDescription, meta } = extractContext(p.projectDescription || '');

                return (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 max-w-xs">
                    <p className="font-medium text-dark text-sm truncate">{p.projectTitle}</p>
                    {plainDescription && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{plainDescription}</p>
                    )}
                    {p.techStack?.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {p.techStack.slice(0, 3).map((t) => (
                          <span key={t} className="badge badge-gray text-[10px]">{t}</span>
                        ))}
                        {p.techStack.length > 3 && (
                          <span className="badge badge-gray text-[10px]">+{p.techStack.length - 3}</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge badge-blue capitalize">{p.platform}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{p.clientCountry}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{meta?.budget || '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{meta?.bidCount ?? '-'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 capitalize">{meta?.generationMode || 'auto'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {meta?.selectedInstruction?.title || 'Auto Select'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    <div className="flex flex-col gap-0.5">
                      <span>
                        Payment: {meta?.clientVerification?.paymentVerified ? 'Yes' : 'No'}
                      </span>
                      <span>
                        Email: {meta?.clientVerification?.emailVerified ? 'Yes' : 'No'}
                      </span>
                      <span>
                        Phone: {meta?.clientVerification?.phoneVerified ? 'Yes' : 'No'}
                      </span>
                      {meta?.projectUrl && (
                        <a className="text-primary hover:underline truncate" href={meta.projectUrl} target="_blank" rel="noopener noreferrer">
                          Project Link
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-dark">
                    ${p.bidAmount} <span className="text-slate-400 font-normal">{p.currency}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="relative inline-block">
                      <select
                        value={p.status}
                        onChange={(e) => statusMutation.mutate({ id: p.id, status: e.target.value })}
                        className={clsx(
                          'appearance-none pr-6 pl-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border-0 focus:outline-none',
                          p.status === 'won' && 'bg-emerald-100 text-emerald-700',
                          p.status === 'lost' && 'bg-red-100 text-red-700',
                          p.status === 'pending' && 'bg-amber-100 text-amber-700',
                          p.status === 'no_response' && 'bg-slate-100 text-slate-700',
                        )}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {format(parseISO(p.createdAt), 'MMM d, yyyy')}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
