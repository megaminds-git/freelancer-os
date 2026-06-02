import React from 'react';
import clsx from 'clsx';

export type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'blue' | 'gray';

export interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-primary/10 text-primary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  blue: 'bg-accent/10 text-accent',
  gray: 'bg-slate-100 text-slate-600',
};

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
