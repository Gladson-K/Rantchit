import React from 'react';

/* ------------------------------------------------------------------ */
/* Retro window chrome                                                 */
/* ------------------------------------------------------------------ */
interface RetroWindowProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  right?: React.ReactNode;
  testId?: string;
}

export function RetroWindow({ title, children, className = '', right, testId }: RetroWindowProps) {
  return (
    <div className={`retro-window ${className}`} data-testid={testId}>
      <div className="retro-titlebar flex items-center justify-between px-3 py-2">
        <span className="font-pixel text-[10px] font-bold uppercase tracking-widest text-black/90">
          {title}
        </span>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Retro button                                                        */
/* ------------------------------------------------------------------ */
type Variant = 'default' | 'green' | 'cyan' | 'magenta' | 'red';

interface RetroButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function RetroButton({ variant = 'default', className = '', children, ...rest }: RetroButtonProps) {
  const variantClass =
    variant === 'green'
      ? 'retro-btn-green'
      : variant === 'cyan'
        ? 'retro-btn-cyan'
        : variant === 'magenta'
          ? 'retro-btn-magenta'
          : variant === 'red'
            ? 'retro-btn-red'
            : '';
  return (
    <button className={`retro-btn ${variantClass} ${className}`} {...rest}>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Scrolling arcade marquee                                            */
/* ------------------------------------------------------------------ */
export function Marquee({ items }: { items: string[] }) {
  const line = items.join('   ◆   ');
  return (
    <div className="overflow-hidden border-y-2 border-arcade-border bg-arcade-deep py-1.5">
      <div className="flex whitespace-nowrap animate-marquee">
        <span className="font-pixel text-[9px] uppercase tracking-widest text-arcade-cyan px-4">
          {line}   ◆   
        </span>
        <span className="font-pixel text-[9px] uppercase tracking-widest text-arcade-cyan px-4" aria-hidden>
          {line}   ◆   
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat chip                                                           */
/* ------------------------------------------------------------------ */
export function RetroStat({
  label,
  value,
  color = 'green',
}: {
  label: string;
  value: React.ReactNode;
  color?: 'green' | 'cyan' | 'magenta' | 'yellow' | 'red';
}) {
  const colorMap: Record<string, string> = {
    green: 'text-arcade-green border-arcade-green/50',
    cyan: 'text-arcade-cyan border-arcade-cyan/50',
    magenta: 'text-arcade-magenta border-arcade-magenta/50',
    yellow: 'text-arcade-yellow border-arcade-yellow/50',
    red: 'text-arcade-red border-arcade-red/50',
  };
  return (
    <div className={`retro-inset px-2.5 py-1.5 border ${colorMap[color]}`}>
      <div className="font-pixel text-[8px] uppercase tracking-widest text-arcade-muted">{label}</div>
      <div className="font-pixel text-[11px] mt-1">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab bar                                                             */
/* ------------------------------------------------------------------ */
export interface TabDef {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
}

export function RetroTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`font-pixel text-[9px] uppercase tracking-widest px-3 py-2 border-2 transition-colors ${
              isActive
                ? 'bg-arcade-green text-black border-arcade-green'
                : 'bg-arcade-panel text-arcade-muted border-arcade-border hover:text-arcade-green'
            }`}
          >
            {t.icon ? <span className="mr-1.5">{t.icon}</span> : null}
            {t.label}
            {typeof t.badge === 'number' && t.badge > 0 ? (
              <span className="ml-1.5 px-1.5 bg-arcade-magenta text-black rounded-sm">{t.badge}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
