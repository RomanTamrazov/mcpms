'use client';
import { type Section } from '@/lib/app-routes';
import { Bell, ChevronRight, Menu, Moon, Search, Sun, type LucideIcon } from 'lucide-react';
import { MetricCard, PageHeader, StatusBadge } from '@/components/ui/enterprise';
import { UserAccount, roleLabels, nav, MlConnectionState, connectionLabel } from './moscollector-core';


export function NavButton({
  item,
  active,
  count,
  onClick,
}: {
  item: (typeof nav)[number];
  active: boolean;
  count?: number;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick} aria-label={item.label} title={item.label} aria-current={active ? 'page' : undefined}>
      <Icon size={19} />
      <span>{item.label}</span>
      {item.id === 'predictions' && count !== undefined && <b>{count}</b>}
    </button>
  );
}



export function Header({
  section,
  user,
  darkTheme,
  menuOpen,
  onToggleTheme,
  onMenu,
  onOpenSearch,
  onToggleNotifications,
  notificationCount,
  notificationsOpen,
  mlConnection,
  usingDemoFeed,
}: {
  section: Section;
  user: UserAccount;
  darkTheme: boolean;
  menuOpen: boolean;
  onToggleTheme: () => void;
  onMenu: () => void;
  onOpenSearch: () => void;
  onToggleNotifications: () => void;
  notificationCount: number;
  notificationsOpen: boolean;
  mlConnection: MlConnectionState;
  usingDemoFeed: boolean;
}) {
  const titles: Record<Section, string> = {
    dashboard: 'Ситуационный центр',
    map: 'Карта объектов',
    predictions: 'Прогнозы',
    incidents: 'Журнал',
    equipment: 'Оборудование',
    maintenance: 'Заявки',
    schedule: 'Графики ППР и ТО',
    analytics: 'Аналитика',
  };
  const categories: Record<Section, string> = {
    dashboard: 'Обзор', map: 'Мониторинг', predictions: 'Мониторинг',
    incidents: 'Операции', equipment: 'Активы', maintenance: 'Операции', schedule: 'Операции', analytics: 'Аналитика',
  };
  return (
    <header className="topbar">
      <button className="icon-btn mobile-menu" type="button" aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'} aria-expanded={menuOpen} onClick={onMenu}>
        <Menu size={20} />
      </button>
      <div>
        <p className="eyebrow topbar-breadcrumb"><span>МосКоллектор</span><ChevronRight size={12} /><span>{categories[section]}</span></p>
        <h1>{titles[section]}</h1>
      </div>
      <div className="top-actions">
        <button className="command-trigger" onClick={onOpenSearch} aria-label="Поиск по системе, Control или Command K">
          <Search size={16} /><span>Поиск по системе</span><kbd>⌘ K</kbd>
        </button>
        <StatusBadge tone={usingDemoFeed ? 'neutral' : mlConnection === 'online' ? 'success' : mlConnection === 'degraded' || mlConnection === 'offline' ? 'warning' : 'neutral'} className="topbar-system-status" title={usingDemoFeed ? `Показана демонстрационная лента. ${connectionLabel(mlConnection)}` : connectionLabel(mlConnection)}>
          <i className={`system-dot ${usingDemoFeed ? 'demo' : mlConnection}`} />{usingDemoFeed ? 'Демо-данные' : connectionLabel(mlConnection)}
        </StatusBadge>
        <span className="shift-badge">
          Смена 01 <i /> {user.district === 'Все округа' ? 'Все округа' : user.district}
        </span>
        <ThemeToggle darkTheme={darkTheme} onToggle={onToggleTheme} />
        <button
          className="icon-btn notification"
          type="button"
          aria-label={`Открыть центр уведомлений, непрочитанных: ${notificationCount}`}
          aria-expanded={notificationsOpen}
          onClick={onToggleNotifications}
        >
          <Bell size={19} />
          {notificationCount > 0 && <b>{notificationCount > 9 ? '9+' : notificationCount}</b>}
        </button>
        <span className="avatar top-avatar" title={`${user.name} · ${roleLabels[user.role]}`} aria-label={`${user.name} · ${roleLabels[user.role]}`}>
          {user.name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)}
        </span>
      </div>
    </header>
  );
}



export function ThemeToggle({
  darkTheme,
  onToggle,
}: {
  darkTheme: boolean;
  onToggle: () => void;
}) {
  const label = darkTheme ? 'Включить светлую тему' : 'Включить тёмную тему';
  return (
    <button
      className="icon-btn theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      {darkTheme ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}


export function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return <PageHeader title={title} description={subtitle} actions={action} />;
}


export function Metric({
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
  return <MetricCard icon={Icon} label={label} value={value} note={note} tone={tone} trend={trend} />;
}


export function PanelHead({
  title,
  subtitle,
  link,
  onClick,
}: {
  title: string;
  subtitle?: string;
  link?: string;
  onClick?: () => void;
}) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {link && (
        <button onClick={onClick}>
          {link}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}
