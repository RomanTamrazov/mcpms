'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Search, type LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/enterprise';


export type CommandItem = {
  id: string;
  title: string;
  description: string;
  group: string;
  icon: LucideIcon;
  action: () => void;
};



export function GlobalCommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: CommandItem[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    return normalized
      ? commands.filter((item) => `${item.title} ${item.description} ${item.group}`.toLocaleLowerCase('ru').includes(normalized)).slice(0, 20)
      : [
          ...recentIds.map((id) => commands.find((item) => item.id === id)).filter((item): item is CommandItem => Boolean(item)).map((item) => ({ ...item, group: 'Недавние' })),
          ...commands.filter((item) => !recentIds.includes(item.id)),
        ].slice(0, 14);
  }, [commands, query, recentIds]);
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const stored = JSON.parse(window.localStorage.getItem('moscollector-command-recent') || '[]') as unknown;
      setRecentIds(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string').slice(0, 4) : []);
    } catch { setRecentIds([]); }
    setQuery('');
    setSelected(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => previousFocusRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])') || []);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);
  if (!open) return null;
  const run = (command: CommandItem) => {
    const next = [command.id, ...recentIds.filter((id) => id !== command.id)].slice(0, 4);
    setRecentIds(next);
    try { window.localStorage.setItem('moscollector-command-recent', JSON.stringify(next)); } catch { /* Search remains usable without persistence. */ }
    onClose();
    command.action();
  };
  return (
    <div className="command-overlay">
      <button className="command-backdrop" aria-label="Закрыть поиск" onClick={onClose} />
      <section ref={dialogRef} className="command-dialog" role="dialog" aria-modal="true" aria-labelledby="command-title">
        <h2 id="command-title" className="sr-only">Поиск по системе</h2>
        <div className="command-input-wrap"><Search size={19} /><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((current) => Math.min(Math.max(0, results.length - 1), current + 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((current) => Math.max(0, current - 1)); }
          if (event.key === 'Enter' && results[selected]) { event.preventDefault(); run(results[selected]); }
        }} placeholder="Объект, раздел, прогноз…" aria-label="Введите запрос" /><kbd>ESC</kbd></div>
        <div className="command-results" role="listbox" aria-label="Результаты поиска">
          {results.length > 0 ? results.map((item, index) => {
            const Icon = item.icon;
            return <div key={`${item.group}-${item.id}`} className="command-result-row">{(index === 0 || results[index - 1].group !== item.group) && <div className="command-group-label" role="presentation">{item.group}</div>}<button role="option" aria-selected={selected === index} className={selected === index ? 'selected' : ''} onMouseEnter={() => setSelected(index)} onClick={() => run(item)}><span className="command-result-icon"><Icon size={17} /></span><span><strong>{item.title}</strong><small>{item.description}</small></span><ChevronRight size={16} /></button></div>;
          }) : <EmptyState title="Ничего не найдено" description="Проверьте запрос или выберите раздел из списка." />}
        </div>
        <footer className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> для навигации</span><span><kbd>↵</kbd> открыть</span><span><kbd>Ctrl/⌘ K</kbd> поиск</span></footer>
      </section>
    </div>
  );
}
