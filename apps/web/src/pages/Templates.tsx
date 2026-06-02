import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, X, Check, FileText, SlidersHorizontal } from 'lucide-react';
import { templatesApi } from '../lib/api';

interface StoredInstructionTemplate {
  id: string;
  name: string;
  category: string;
  strategy: string;
  components: Record<string, unknown>;
  createdAt: string;
}

interface InstructionViewModel {
  id: string;
  title: string;
  content: string;
  wordLimit: number;
  endingText: string;
  appendEnding: boolean;
  createdAt: string;
}

function parseStrategy(raw: string): { wordLimit: number; endingText: string; appendEnding: boolean } {
  try {
    const parsed = JSON.parse(raw) as { wordLimit?: number; endingText?: string; appendEnding?: boolean };
    return {
      wordLimit: typeof parsed.wordLimit === 'number' && parsed.wordLimit > 0 ? parsed.wordLimit : 170,
      endingText: typeof parsed.endingText === 'string' ? parsed.endingText : 'Best regards, {Your Name}',
      appendEnding: parsed.appendEnding !== false,
    };
  } catch {
    return { wordLimit: 170, endingText: 'Best regards, {Your Name}', appendEnding: true };
  }
}

export default function Templates() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [title, setTitle] = useState('Instruction 1');
  const [wordLimit, setWordLimit] = useState(170);
  const [content, setContent] = useState('');
  const [endingText, setEndingText] = useState('Best regards, {Your Name}');
  const [appendEnding, setAppendEnding] = useState(true);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesApi.list,
  });

  const instructions = useMemo<InstructionViewModel[]>(() => {
    return (templates as StoredInstructionTemplate[])
      .filter((t) => t.category === 'instruction')
      .map((t) => {
        const strategy = parseStrategy(t.strategy);
        const contentRaw = t.components?.instructionContent;
        return {
          id: t.id,
          title: t.name,
          content: typeof contentRaw === 'string' ? contentRaw : '',
          wordLimit: strategy.wordLimit,
          endingText: strategy.endingText,
          appendEnding: strategy.appendEnding,
          createdAt: t.createdAt,
        };
      });
  }, [templates]);

  const createMutation = useMutation({
    mutationFn: () =>
      templatesApi.create({
        name: title,
        category: 'instruction',
        strategy: JSON.stringify({ wordLimit, endingText, appendEnding }),
        components: { instructionContent: content },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (id: string) =>
      templatesApi.update(id, {
        name: title,
        category: 'instruction',
        strategy: JSON.stringify({ wordLimit, endingText, appendEnding }),
        components: { instructionContent: content },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['templates'] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => templatesApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  function openCreate() {
    setEditingId(null);
    setTitle(`Instruction ${instructions.length + 1}`);
    setWordLimit(170);
    setContent('');
    setEndingText('Best regards, {Your Name}');
    setAppendEnding(true);
    setShowForm(true);
  }

  function openEdit(instruction: InstructionViewModel) {
    setEditingId(instruction.id);
    setTitle(instruction.title);
    setWordLimit(instruction.wordLimit);
    setContent(instruction.content);
    setEndingText(instruction.endingText);
    setAppendEnding(instruction.appendEnding);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !wordLimit) return;

    if (editingId) updateMutation.mutate(editingId);
    else createMutation.mutate();
  }

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark">Instructions</h1>
          <p className="text-slate-500 mt-0.5">Define reusable proposal generation rules</p>
        </div>
        <button onClick={openCreate} className="btn-primary text-xs px-3 py-2">
          <Plus size={14} /> New Instruction
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-4 animate-pulse h-36" />
          ))}
        </div>
      ) : instructions.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
            <FileText size={20} className="text-slate-300" />
          </div>
          <p className="text-slate-500">No instructions yet.</p>
          <button onClick={openCreate} className="btn-primary mt-4 text-sm">
            <Plus size={14} /> Create First Instruction
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {instructions.map((instruction) => (
            <div key={instruction.id} className="card p-4 group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <p className="font-semibold text-dark text-sm">{instruction.title}</p>
                <span className="badge badge-blue text-xs">{instruction.wordLimit} words</span>
              </div>

              <p className="text-sm text-dark leading-relaxed whitespace-pre-wrap line-clamp-4 mb-3">
                {instruction.content}
              </p>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 mb-3">
                <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">Default Options</p>
                <p className="text-xs text-slate-600 truncate">
                  Ending: {instruction.appendEnding ? instruction.endingText : 'Disabled'}
                </p>
              </div>

              <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => openEdit(instruction)}
                  className="p-1.5 text-slate-400 hover:text-primary rounded hover:bg-primary/10 transition-colors"
                >
                  <Edit2 size={13} />
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this instruction?')) deleteMutation.mutate(instruction.id);
                  }}
                  className="p-1.5 text-slate-400 hover:text-danger rounded hover:bg-danger/10 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h2 className="font-semibold text-dark">{editingId ? 'Edit Instruction' : 'New Instruction'}</h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-dark">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="label">Instruction Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="input"
                  placeholder="Instruction 1"
                />
              </div>

              <div>
                <label className="label">Word Limit</label>
                <input
                  value={wordLimit}
                  onChange={(e) => setWordLimit(Number(e.target.value))}
                  type="number"
                  min={50}
                  max={600}
                  className="input"
                  placeholder="170"
                />
              </div>

              <div>
                <label className="label">Instruction Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  className="input resize-none"
                  placeholder="Define how the proposal should be generated..."
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-3">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                  <SlidersHorizontal size={12} /> Default Options
                </p>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={appendEnding}
                    onChange={(e) => setAppendEnding(e.target.checked)}
                    className="w-3.5 h-3.5 rounded accent-primary"
                  />
                  <span className="text-xs text-slate-700">Append ending text</span>
                </label>

                <div>
                  <label className="label text-xs">Ending Text</label>
                  <input
                    value={endingText}
                    onChange={(e) => setEndingText(e.target.value)}
                    className="input text-sm"
                    placeholder="Best regards, {Your Name}"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button type="button" onClick={closeForm} className="btn-secondary">Cancel</button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="btn-primary"
                >
                  <Check size={14} />
                  {editingId ? 'Save Instruction' : 'Create Instruction'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
