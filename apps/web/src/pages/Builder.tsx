import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Copy, Check, Sparkles, RefreshCw, BookOpen, X } from 'lucide-react';
import { templatesApi, aiApi, proposalsApi } from '../lib/api';
import type { TemplateComponent, ComponentType, Proposal } from '@freelancer-os/shared';
import clsx from 'clsx';

const COMPONENT_TYPES: { type: ComponentType; label: string }[] = [
  { type: 'greeting', label: 'Greeting' },
  { type: 'opening', label: 'Opening' },
  { type: 'strategy', label: 'Strategy' },
  { type: 'closing', label: 'Closing' },
  { type: 'regards', label: 'Regards' },
  { type: 'ps', label: 'P.S.' },
];

type PanelTab = 'components' | 'references';

export default function Builder() {
  const [selected, setSelected] = useState<Partial<Record<ComponentType, TemplateComponent>>>({});
  const [projectTitle, setProjectTitle] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [aiProposal, setAiProposal] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeType, setActiveType] = useState<ComponentType>('greeting');
  const [panelTab, setPanelTab] = useState<PanelTab>('components');
  const [refExpanded, setRefExpanded] = useState<string | null>(null);

  const { data: components = [] } = useQuery({
    queryKey: ['components'],
    queryFn: () => templatesApi.listComponents(),
  });

  const { data: references = [] } = useQuery({
    queryKey: ['proposal-references'],
    queryFn: proposalsApi.references,
  });

  const aiMutation = useMutation({
    mutationFn: () =>
      aiApi.generateProposal({
        projectTitle: projectTitle || 'Untitled Project',
        projectDescription: projectDesc,
        strategy: 'Concise Punch',
      }),
    onSuccess: (data) => setAiProposal(data.proposal),
  });

  const byType = (type: ComponentType): TemplateComponent[] =>
    components.filter((c: TemplateComponent) => c.type === type);

  const assembled = COMPONENT_TYPES.map(({ type }) => selected[type]?.content ?? '')
    .filter(Boolean)
    .join('\n\n');

  const finalText = aiProposal || assembled;

  function handleCopy() {
    if (!finalText) return;
    navigator.clipboard.writeText(finalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function useReferenceAsBase(ref: Proposal) {
    setAiProposal(ref.content);
    setProjectTitle(ref.projectTitle);
  }

  return (
    <div className="page-shell">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-dark">Proposal Builder</h1>
        <p className="text-slate-500 mt-0.5">Assemble from saved components or generate with AI</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel */}
        <div className="space-y-4">
          {/* AI Generate Section */}
          <div className="card p-5">
            <h2 className="font-semibold text-dark mb-3 flex items-center gap-2">
              <Sparkles size={16} className="text-primary" /> AI Generation
            </h2>
            <div className="space-y-3">
              <div>
                <label className="label">Project Title</label>
                <input
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  className="input"
                  placeholder="e.g. Build React Dashboard"
                />
              </div>
              <div>
                <label className="label">Project Description</label>
                <textarea
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  rows={4}
                  className="input resize-none"
                  placeholder="Paste the project description here..."
                />
              </div>
              <button
                onClick={() => aiMutation.mutate()}
                disabled={!projectDesc || aiMutation.isPending}
                className="btn-primary w-full justify-center"
              >
                {aiMutation.isPending ? (
                  <><RefreshCw size={14} className="animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles size={14} /> Generate with AI</>
                )}
              </button>
              {aiMutation.isError && (
                <p className="text-xs text-danger">Generation failed. Check your profile has skills set.</p>
              )}
            </div>
          </div>

          {/* Components / References Panel */}
          <div className="card p-5">
            {/* Tab Bar */}
            <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-lg w-fit">
              <button
                onClick={() => setPanelTab('components')}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  panelTab === 'components' ? 'bg-white text-dark shadow-sm' : 'text-slate-500 hover:text-dark',
                )}
              >
                Components
              </button>
              <button
                onClick={() => setPanelTab('references')}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  panelTab === 'references' ? 'bg-white text-dark shadow-sm' : 'text-slate-500 hover:text-dark',
                )}
              >
                <BookOpen size={12} />
                References
                {references.length > 0 && (
                  <span className="bg-primary/10 text-primary rounded-full px-1.5 text-[10px]">
                    {references.length}
                  </span>
                )}
              </button>
            </div>

            {/* Component Assembly Tab */}
            {panelTab === 'components' && (
              <>
                <div className="flex flex-wrap gap-1 mb-4">
                  {COMPONENT_TYPES.map(({ type, label }) => (
                    <button
                      key={type}
                      onClick={() => setActiveType(type)}
                      className={clsx(
                        'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                        activeType === type ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                      )}
                    >
                      {label}
                      {selected[type] && (
                        <span className="ml-1 w-1.5 h-1.5 bg-success rounded-full inline-block align-middle" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {byType(activeType).length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">
                      No {activeType} components yet. Go to Templates to create some.
                    </p>
                  ) : (
                    byType(activeType).map((c) => (
                      <button
                        key={c.id}
                        onClick={() =>
                          setSelected((prev) => ({
                            ...prev,
                            [activeType]: prev[activeType]?.id === c.id ? undefined : c,
                          }))
                        }
                        className={clsx(
                          'w-full text-left p-3 rounded-lg border text-sm transition-colors',
                          selected[activeType]?.id === c.id
                            ? 'border-primary bg-primary/5 text-dark'
                            : 'border-slate-200 hover:border-slate-300 text-slate-600',
                        )}
                      >
                        <p className="line-clamp-2">{c.content}</p>
                        {c.tags.length > 0 && (
                          <div className="flex gap-1 mt-1.5">
                            {c.tags.map((t) => (
                              <span key={t} className="badge badge-gray text-[10px]">{t}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {/* References Tab */}
            {panelTab === 'references' && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {references.length === 0 ? (
                  <div className="py-8 text-center">
                    <BookOpen size={24} className="mx-auto mb-2 text-slate-200" />
                    <p className="text-sm text-slate-400">No saved references yet.</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Go to Proposals and click the bookmark icon on a winning proposal to save it here.
                    </p>
                  </div>
                ) : (
                  references.map((ref: Proposal) => (
                    <div key={ref.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-3 bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-dark truncate">{ref.projectTitle}</p>
                          <p className="text-xs text-slate-400 mt-0.5 capitalize">
                            {ref.platform} · ${ref.bidAmount}
                          </p>
                        </div>
                        <div className="flex gap-1.5 ml-2 flex-shrink-0">
                          <button
                            onClick={() => setRefExpanded(refExpanded === ref.id ? null : ref.id)}
                            className="btn-secondary text-[11px] px-2 py-1"
                          >
                            {refExpanded === ref.id ? 'Hide' : 'View'}
                          </button>
                          <button
                            onClick={() => useReferenceAsBase(ref)}
                            className="btn-primary text-[11px] px-2 py-1"
                          >
                            Use
                          </button>
                        </div>
                      </div>
                      {refExpanded === ref.id && (
                        <div className="p-3 text-xs text-slate-600 whitespace-pre-wrap max-h-48 overflow-y-auto bg-white border-t border-slate-100">
                          {ref.content}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Preview */}
        <div className="card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-dark">Preview</h2>
            <div className="flex gap-2">
              {aiProposal && (
                <button
                  onClick={() => setAiProposal('')}
                  className="btn-secondary text-xs px-2 py-1.5"
                >
                  <X size={12} /> Clear
                </button>
              )}
              <button
                onClick={handleCopy}
                disabled={!finalText}
                className={clsx('btn text-xs px-3 py-1.5', copied ? 'bg-success text-white' : 'btn-primary')}
              >
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
              </button>
            </div>
          </div>

          {!aiProposal && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {COMPONENT_TYPES.map(({ type, label }) => (
                <span
                  key={type}
                  className={clsx('badge text-[10px]', selected[type] ? 'badge-success' : 'badge-gray')}
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {aiProposal && (
            <div className="mb-2">
              <span className="badge badge-blue gap-1"><Sparkles size={10} /> AI Generated</span>
            </div>
          )}

          <div className="flex-1 bg-slate-50 rounded-xl p-4 min-h-64 font-mono text-sm text-dark whitespace-pre-wrap leading-relaxed overflow-y-auto">
            {finalText || (
              <span className="text-slate-300">
                Your assembled proposal will appear here. Select components, use a reference, or generate with AI.
              </span>
            )}
          </div>

          {finalText && (
            <p className="text-xs text-slate-400 mt-2">
              {finalText.split(/\s+/).filter(Boolean).length} words · {finalText.length} characters
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
