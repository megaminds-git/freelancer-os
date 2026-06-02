import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Download, Trash2, ChevronDown, X, BookmarkPlus } from 'lucide-react';
import { proposalsApi } from '../lib/api';
import { ProposalSchema, type ProposalInput, TECH_SKILLS, PLATFORMS, POPULAR_COUNTRIES } from '@freelancer-os/shared';
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
const STATUS_CLASSES: Record<string, string> = {
  won: 'badge-success',
  lost: 'badge-danger',
  pending: 'badge-warning',
  no_response: 'badge-gray',
};

export default function Proposals() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [skillInput, setSkillInput] = useState('');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [page] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['proposals', statusFilter, page],
    queryFn: () => proposalsApi.list({ status: statusFilter || undefined, page }),
  });

  const proposals: Proposal[] = data?.proposals ?? [];

  const createMutation = useMutation({
    mutationFn: (body: ProposalInput) => proposalsApi.create({ ...body, techStack: selectedSkills }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
      setShowModal(false);
      reset();
      setSelectedSkills([]);
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => proposalsApi.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proposals'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proposals'] });
      qc.invalidateQueries({ queryKey: ['analytics'] });
    },
  });

  const refMutation = useMutation({
    mutationFn: (id: string) => proposalsApi.saveReference(id),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ProposalInput>({
    resolver: zodResolver(ProposalSchema),
    defaultValues: { currency: 'USD', platform: 'upwork', clientCountry: 'United States', clientTimezone: 'UTC' },
  });

  function handleExportCsv() {
    proposalsApi.exportCsv().then((res) => {
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'proposals.csv';
      a.click();
    });
  }

  function toggleSkill(skill: string) {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  }

  function addCustomSkill() {
    const s = skillInput.trim();
    if (s && !selectedSkills.includes(s)) {
      setSelectedSkills((prev) => [...prev, s]);
    }
    setSkillInput('');
  }

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Proposals</h1>
          <p className="text-slate-500 mt-0.5">Track your active proposals (7-day window)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCsv} className="btn-secondary text-xs px-3 py-2">
            <Download size={14} /> Export CSV
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary text-xs px-3 py-2">
            <Plus size={14} /> New Proposal
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 bg-white border border-slate-200 rounded-lg p-1 w-fit">
        {['', ...STATUS_OPTIONS].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={clsx(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              statusFilter === s
                ? 'bg-primary text-white'
                : 'text-slate-500 hover:text-dark',
            )}
          >
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Loading proposals...</div>
        ) : proposals.length === 0 ? (
          <div className="p-12 text-center">
            <FileTextEmpty />
            <p className="text-slate-500 mt-2">No proposals found. Create your first one!</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                {['Project', 'Platform', 'Bid', 'Status', 'Expires', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {proposals.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-dark text-sm truncate max-w-xs">{p.projectTitle}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{p.clientCountry}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="badge badge-blue capitalize">{p.platform}</span>
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
                          'appearance-none pr-6 pl-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-primary/30',
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
                      <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-current opacity-60" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">
                    {format(parseISO(p.expiresAt), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => refMutation.mutate(p.id)}
                        title="Save as reference"
                        className="p-1.5 text-slate-400 hover:text-primary rounded-md hover:bg-primary/10 transition-colors"
                      >
                        <BookmarkPlus size={14} />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Delete this proposal?')) deleteMutation.mutate(p.id);
                        }}
                        className="p-1.5 text-slate-400 hover:text-danger rounded-md hover:bg-danger/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-dark">New Proposal</h2>
              <button onClick={() => { setShowModal(false); reset(); setSelectedSkills([]); }} className="text-slate-400 hover:text-dark">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Project Title</label>
                  <input {...register('projectTitle')} className="input" placeholder="e.g. Build React Dashboard" />
                  {errors.projectTitle && <p className="mt-1 text-xs text-danger">{errors.projectTitle.message}</p>}
                </div>

                <div className="col-span-2">
                  <label className="label">Project Description</label>
                  <textarea {...register('projectDescription')} rows={3} className="input resize-none" placeholder="Paste the project description..." />
                  {errors.projectDescription && <p className="mt-1 text-xs text-danger">{errors.projectDescription.message}</p>}
                </div>

                <div>
                  <label className="label">Platform</label>
                  <select {...register('platform')} className="input">
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p.toLowerCase().replace('.', '')}>{p}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="label">Client Country</label>
                  <select {...register('clientCountry')} className="input">
                    {POPULAR_COUNTRIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="label">Bid Amount</label>
                  <input {...register('bidAmount', { valueAsNumber: true })} type="number" min="1" className="input" placeholder="500" />
                  {errors.bidAmount && <p className="mt-1 text-xs text-danger">{errors.bidAmount.message}</p>}
                </div>

                <div>
                  <label className="label">Currency</label>
                  <select {...register('currency')} className="input">
                    {['USD', 'EUR', 'GBP', 'AUD', 'CAD'].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="label">Proposal Content</label>
                  <textarea {...register('content')} rows={5} className="input resize-none" placeholder="Your proposal text..." />
                  {errors.content && <p className="mt-1 text-xs text-danger">{errors.content.message}</p>}
                </div>

                <div className="col-span-2">
                  <label className="label">Tech Stack</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedSkills.map((s) => (
                      <button key={s} type="button" onClick={() => toggleSkill(s)}
                        className="badge badge-blue gap-1">
                        {s} <X size={10} />
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={skillInput}
                      onChange={(e) => setSkillInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSkill(); } }}
                      className="input flex-1"
                      placeholder="Add custom skill or pick below..."
                    />
                    <button type="button" onClick={addCustomSkill} className="btn-secondary text-xs px-3">Add</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                    {TECH_SKILLS.filter((s) => !selectedSkills.includes(s)).map((s) => (
                      <button key={s} type="button" onClick={() => toggleSkill(s)}
                        className="badge badge-gray hover:badge-blue transition-colors cursor-pointer">
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={() => { setShowModal(false); reset(); setSelectedSkills([]); }} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting || createMutation.isPending} className="btn-primary">
                  {createMutation.isPending ? 'Saving...' : 'Save Proposal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function FileTextEmpty() {
  return (
    <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto">
      <svg className="w-6 h-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    </div>
  );
}
