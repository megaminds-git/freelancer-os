import React from 'react';
import clsx from 'clsx';

export interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export function Card({ children, className, padding = 'md', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-2xl border border-slate-200 shadow-sm',
        paddingClasses[padding],
        onClick && 'cursor-pointer hover:border-slate-300 transition-colors',
        className,
      )}
    >
      {children}
    </div>
  );
}
