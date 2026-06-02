import React from 'react';
import clsx from 'clsx';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-slate-700 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full h-9 px-3 rounded-lg border text-sm text-dark bg-white transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            error
              ? 'border-danger focus:ring-danger/30 focus:border-danger'
              : 'border-slate-200 hover:border-slate-300',
            'placeholder:text-slate-400',
            'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
    );
  },
);

Input.displayName = 'Input';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-slate-700 mb-1">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={clsx(
            'w-full px-3 py-2 rounded-lg border text-sm text-dark bg-white transition-colors resize-none',
            'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
            error
              ? 'border-danger focus:ring-danger/30 focus:border-danger'
              : 'border-slate-200 hover:border-slate-300',
            'placeholder:text-slate-400',
            'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
            className,
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
