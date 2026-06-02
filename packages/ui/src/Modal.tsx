import React, { useEffect } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  footer?: React.ReactNode;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, title, children, size = 'md', footer }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/28 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={clsx(
          'relative w-full rounded-2xl flex flex-col max-h-[90vh] border border-white/60 bg-white/86 backdrop-blur-md shadow-[0_18px_48px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.7)]',
          sizeClasses[size],
        )}
      >
        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
            <h2 className="font-semibold text-dark">{title}</h2>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-dark transition-colors p-1 rounded-md hover:bg-slate-100"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
