'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('page-head', className)}>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {actions}
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone: 'red' | 'orange' | 'purple' | 'green' | 'yellow';
  trend: string;
}) {
  return (
    <div className="metric">
      <div className={`metric-icon ${tone}`}><Icon size={20} /></div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      <span className={`metric-trend ${tone}`}>{trend}</span>
    </div>
  );
}

export function StatusBadge({
  children,
  tone = 'neutral',
  className,
  title,
}: {
  children: React.ReactNode;
  tone?: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  className?: string;
  title?: string;
}) {
  return <span className={cn('status-badge', `status-${tone}`, className)} title={title}>{children}</span>;
}

export function RiskBadge({ risk, className }: { risk: string; className?: string }) {
  return <span className={cn('risk', `risk-${risk.toLowerCase()}`, className)}><i />{risk}</span>;
}

export function DataTable({
  children,
  className,
  loading = false,
  empty,
}: React.HTMLAttributes<HTMLDivElement> & {
  loading?: boolean;
  empty?: React.ReactNode;
}) {
  return (
    <div className={cn('table-scroll', className)}>
      {loading ? <LoadingSkeleton rows={4} /> : children ?? empty}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="enterprise-empty" role="status">
      <span className="enterprise-empty-mark">—</span>
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({
  title = 'Не удалось загрузить данные',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="enterprise-error" role="alert">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function LoadingSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('enterprise-skeleton-list', className)} aria-label="Загрузка данных" role="status">
      {Array.from({ length: rows }, (_, index) => <span key={index} />)}
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('panel', 'enterprise-section-card', className)}>
      <header className="panel-head">
        <div><h3>{title}</h3>{description && <p>{description}</p>}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function FilterBar({ children, className }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('filters', 'enterprise-filter-bar', className)}>{children}</div>;
}

export function ObjectPreview({
  title,
  subtitle,
  risk,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  risk?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={cn('object-preview', className)}>
      <div className="object-preview-heading">
        <div><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</div>
        {risk && <RiskBadge risk={risk} />}
      </div>
      {children}
    </article>
  );
}

export function NotificationItem({
  title,
  description,
  source,
  time,
  tone = 'info',
  unread = false,
  onClick,
}: {
  title: string;
  description: string;
  source?: string;
  time: string;
  tone?: 'danger' | 'warning' | 'info';
  unread?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={`notification-dot ${tone}`} />
      <span className="notification-copy"><strong>{title}</strong><small>{description}</small><span className="notification-meta"><span>{source || 'Система'}</span><span aria-hidden="true">·</span><time>{time}</time></span></span>
      {unread && <i className="notification-unread" aria-label="Не прочитано" />}
    </>
  );
  return onClick ? <button className="notification-item" onClick={onClick}>{content}</button> : <article className="notification-item">{content}</article>;
}
