import React from 'react';
import clsx from 'clsx';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center py-12 text-center', className)}>
      {icon && (
        <div className="mb-4 text-slate-200">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-slate-500">{title}</p>
      {description && (
        <p className="text-xs text-slate-400 mt-1 max-w-xs">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
