import React, { useState } from 'react';
import { ChevronDown, ChevronRight, LucideIcon } from 'lucide-react';

interface CollapsibleSectionProps {
  id?: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  badge?: string | number;
  badgeColor?: string;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  className?: string;
  headerClassName?: string;
}

export function CollapsibleSection({
  id,
  title,
  subtitle,
  icon: Icon,
  badge,
  badgeColor = 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  children,
  headerRight,
  className = '',
  headerClassName = ''
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledIsOpen !== undefined;
  const open = isControlled ? controlledIsOpen : internalOpen;

  const handleToggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    if (onToggle) onToggle(next);
  };

  return (
    <div 
      id={id}
      className={`border border-zinc-800/90 rounded-2xl bg-[#13151b] overflow-hidden shadow-lg transition-all ${className}`}
    >
      <div
        onClick={handleToggle}
        className={`px-4 py-3 sm:px-5 sm:py-3.5 flex items-center justify-between cursor-pointer select-none transition-colors hover:bg-zinc-800/40 ${
          open ? 'bg-[#161922] border-b border-zinc-800/80' : 'bg-[#12141a]'
        } ${headerClassName}`}
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className={`p-1 rounded-lg transition-transform duration-200 text-zinc-400 ${open ? 'rotate-180 text-cyan-400' : ''}`}>
            <ChevronDown className="w-4 h-4" />
          </div>

          {Icon && (
            <div className="w-7 h-7 rounded-lg bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-cyan-400 shrink-0">
              <Icon className="w-4 h-4" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-xs sm:text-sm font-bold text-white tracking-wide truncate">{title}</h3>
              {badge !== undefined && (
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p className="text-[11px] text-zinc-400 truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2" onClick={e => e.stopPropagation()}>
          {headerRight}
          <button
            type="button"
            onClick={handleToggle}
            className="text-[11px] font-semibold text-zinc-400 hover:text-cyan-300 px-2 py-1 rounded-lg hover:bg-zinc-800 transition hidden sm:inline-block"
          >
            {open ? 'Plegar' : 'Desplegar'}
          </button>
        </div>
      </div>

      {open && (
        <div className="p-4 sm:p-5 animate-in fade-in-50 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}
