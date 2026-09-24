'use client';
import { useEffect, useRef } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import { NotificationItem, SectionCard } from '@/components/ui/enterprise';


export type NotificationRecord = {
  id: string;
  title: string;
  description: string;
  source: string;
  time: string;
  tone: 'danger' | 'warning' | 'info';
};



export function NotificationCenter({
  open,
  items,
  readIds,
  onClose,
  onMarkAllRead,
  onSelect,
}: {
  open: boolean;
  items: NotificationRecord[];
  readIds: string[];
  onClose: () => void;
  onMarkAllRead: () => void;
  onSelect: (id: string) => void;
}) {
  const centerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => previousFocusRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = Array.from(centerRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') || []).filter((button) => !button.classList.contains('notification-backdrop'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !centerRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !centerRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [open]);
  if (!open) return null;
  const unreadCount = items.filter((item) => !readIds.includes(item.id) && item.id !== 'system-ok').length;
  return (
    <div ref={centerRef} className="notification-overlay" role="dialog" aria-modal="true" aria-label="Центр уведомлений">
      <button className="notification-backdrop" aria-label="Закрыть центр уведомлений" onClick={onClose} />
      <SectionCard title="Центр уведомлений" description={unreadCount ? `${unreadCount} непрочитанных события` : 'Все события просмотрены'} className="notification-center" action={<button ref={closeRef} className="icon-btn" aria-label="Закрыть уведомления" onClick={onClose}><X size={18} /></button>}>
        <div className="notification-center-tools"><span>События и сигналы</span><button onClick={onMarkAllRead} disabled={unreadCount === 0}>Отметить всё прочитанным</button></div>
        <div className="notification-list">
          {([
            ['danger', 'Критические'],
            ['warning', 'Требуют внимания'],
            ['info', 'Системные'],
          ] as const).map(([tone, label]) => {
            const group = items.filter((item) => item.tone === tone);
            return group.length ? <div className="notification-group" key={tone}><div className="notification-group-label">{label}<span>{group.length}</span></div>{group.map((item) => <NotificationItem key={item.id} title={item.title} description={item.description} source={item.source} time={item.time} tone={item.tone} unread={!readIds.includes(item.id) && item.id !== 'system-ok'} onClick={() => onSelect(item.id)} />)}</div> : null;
          })}
        </div>
        <div className="notification-center-foot"><ShieldCheck size={15} /><span>Системные рекомендации не заменяют решения уполномоченного сотрудника.</span></div>
      </SectionCard>
    </div>
  );
}
