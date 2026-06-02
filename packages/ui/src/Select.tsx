import React from 'react';
import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, className, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-slate-700 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            className={clsx(
              'w-full h-9 pl-3 pr-8 rounded-lg border text-sm text-dark bg-white appearance-none transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
              error
                ? 'border-danger focus:ring-danger/30 focus:border-danger'
                : 'border-slate-200 hover:border-slate-300',
              'disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed',
              className,
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        {hint && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
