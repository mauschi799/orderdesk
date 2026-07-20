import { cn, STATUS_COLORS, STATUS_LABELS, STATUS_DOT_COLORS, LAGER_COLORS, LAGER_LABELS } from '../../utils';
import { DeliveryStatus, Depot } from '../../types';

// Status Badge
export function StatusBadge({ status }: { status: DeliveryStatus | string }) {
  return (
    <span className={cn('status-badge', STATUS_COLORS[status] || 'bg-gray-100 text-gray-600 border-gray-200')}>
      <span className={cn('w-1.5 h-1.5 rounded-full', STATUS_DOT_COLORS[status] || 'bg-gray-400')} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// Lager Badge
export function LagerBadge({ lager }: { lager: Depot }) {
  if (!lager) return <span className="text-slate-400 text-xs">–</span>;
  return (
    <span className={cn('status-badge', LAGER_COLORS[lager])}>
      {LAGER_LABELS[lager]}
    </span>
  );
}

// Button
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({
  variant = 'primary', size = 'md', loading, children, className, disabled, ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-orange-500 hover:bg-orange-600 text-white shadow-sm shadow-orange-500/20',
    secondary: 'bg-slate-800 hover:bg-slate-700 text-white',
    ghost: 'hover:bg-slate-100 text-slate-600',
    danger: 'bg-red-500 hover:bg-red-600 text-white',
    outline: 'border border-slate-200 hover:bg-slate-50 text-slate-700'
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg',
    md: 'px-4 py-2 text-sm rounded-xl',
    lg: 'px-5 py-2.5 text-sm rounded-xl'
  };
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center gap-2 font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant], sizes[size], className
      )}
    >
      {loading && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

// Card
export function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('bg-white rounded-xl border border-slate-200/80 shadow-sm', className)} {...props}>
      {children}
    </div>
  );
}

// Page Header
export function PageHeader({
  title, subtitle, actions
}: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white sticky top-0 z-10">
      <div>
        <h1 className="text-lg font-bold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// Empty State
export function EmptyState({ message, icon: Icon }: { message: string; icon?: any }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      {Icon && <Icon className="w-10 h-10 mb-3 opacity-40" />}
      <p className="text-sm">{message}</p>
    </div>
  );
}

// Loading Spinner
export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-12', className)}>
      <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// Select
export function Select({
  value, onChange, options, placeholder, className
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent',
        className
      )}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// Input
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent transition-all',
        className
      )}
    />
  );
}

// Modal
export function Modal({
  isOpen, onClose, title, children, size = 'md'
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  if (!isOpen) return null;
  const sizes = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className={cn('relative bg-white rounded-2xl shadow-2xl w-full animate-slide-in', sizes[size])}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400">
            <span className="text-lg leading-none">✕</span>
          </button>
        </div>
        <div className="overflow-y-auto max-h-[80vh]">
          {children}
        </div>
      </div>
    </div>
  );
}
