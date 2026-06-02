import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  className?: string;
  label?: string;
}

const sizeMap: Record<SpinnerSize, number> = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 28,
};

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <span className={clsx('inline-flex items-center gap-2 text-slate-400', className)} role="status">
      <Loader2 size={sizeMap[size]} className="animate-spin" />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-64">
      <Spinner size="lg" label="Loading..." />
    </div>
  );
}
