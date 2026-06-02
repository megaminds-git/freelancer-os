import React from 'react';
import clsx from 'clsx';
import { CheckCircle, AlertTriangle, XCircle, Info } from 'lucide-react';

export type AlertVariant = 'success' | 'warning' | 'error' | 'info';

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const config: Record<AlertVariant, { icon: React.ElementType; classes: string }> = {
  success: { icon: CheckCircle, classes: 'bg-emerald-50 border-emerald-200 text-success' },
  warning: { icon: AlertTriangle, classes: 'bg-amber-50 border-amber-200 text-warning' },
  error: { icon: XCircle, classes: 'bg-red-50 border-red-200 text-danger' },
  info: { icon: Info, classes: 'bg-blue-50 border-blue-200 text-primary' },
};

export function Alert({ variant = 'info', title, children, className }: AlertProps) {
  const { icon: Icon, classes } = config[variant];

  return (
    <div className={clsx('flex gap-3 p-4 rounded-xl border text-sm', classes, className)}>
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <div>
        {title && <p className="font-medium mb-0.5">{title}</p>}
        <div className="opacity-90">{children}</div>
      </div>
    </div>
  );
}
