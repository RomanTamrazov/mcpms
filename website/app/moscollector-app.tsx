'use client';
import { useEffect, useState } from 'react';
import { parseAppPath, sectionPath, type Section } from '@/lib/app-routes';
import { Activity, AlertTriangle, Bell, Building2, Check, Factory, LogOut, PanelLeftClose, PanelLeftOpen, RefreshCcw, SlidersHorizontal, Users } from 'lucide-react';
import { LoadingSkeleton } from '@/components/ui/enterprise';
import { fetchMlHealth, fetchMlPredictions, hasMlApiUrl, type MlHealth, type MlPredictionFeed } from '@/lib/ml-api';
import { UserRole, UserAccount, roleLabels, themeStorageKey, readNotificationsStorageKey, deploymentBasePath, deploymentPath, storeCurrentUser, loadCurrentUser, nav, roleSections, MlConnectionState, predictions, equipment, riskScoreLabel } from './moscollector-core';
import { NavButton, Header } from './moscollector-layout';
import { GlobalCommandPalette } from './moscollector-command-palette';
import { NotificationCenter } from './moscollector-notifications';
import { Dashboard } from './moscollector-dashboard';
import { MapPage } from './moscollector-map';
import { Predictions, PredictionDetail } from './moscollector-predictions';
import { Incidents } from './moscollector-journal';
import { EquipmentPage, EquipmentDetail } from './moscollector-equipment';
import { Maintenance } from './moscollector-maintenance';
import { MaintenancePlan } from './moscollector-maintenance-plan';
import { Analytics } from './moscollector-analytics';
import { AdminPanel } from './moscollector-admin';
import { Login } from './moscollector-auth';
import './maintenance-plan.css';


export default function MoscollectorApp() {
  const [section, setSection] = useState<Section>('dashboard');
  const [detail, setDetail] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState('');
  const [darkTheme, setDarkTheme] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([]);
  const [mlConnection, setMlConnection] = useState<MlConnectionState>('loading');
  const [mlHealth, setMlHealth] = useState<MlHealth | null>(null);
  const [liveFeed, setLiveFeed] = useState<MlPredictionFeed>({ items: [], contexts: {} });
  const [mlFeedError, setMlFeedError] = useState('');
  const [lastMlSync, setLastMlSync] = useState('—');
  const [mlRefreshToken, setMlRefreshToken] = useState(0);
  const [refreshInterval, setRefreshInterval] = useState('0.5');
  const [criticalNotifications, setCriticalNotifications] = useState(true);
  const activePredictions = liveFeed.items.length > 0 ? liveFeed.items : predictions;
  const usingDemoFeed = liveFeed.items.length === 0;

  useEffect(() => {
    try { setSidebarCollapsed(window.localStorage.getItem('moscollector-sidebar-collapsed') === 'true'); }
    catch { /* Keep the full navigation when storage is unavailable. */ }
  }, []);
  const toggleSidebar = () => setSidebarCollapsed((current) => {
    const next = !current;
    try { window.localStorage.setItem('moscollector-sidebar-collapsed', String(next)); } catch { /* Session state still works. */ }
    return next;
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('moscollector-ui-settings');
      if (!stored) return;
      const settings = JSON.parse(stored) as { refreshInterval?: string; criticalNotifications?: boolean };
      if (['0.5', '1', '5', '15', 'manual'].includes(settings.refreshInterval || '')) setRefreshInterval(settings.refreshInterval!);
      if (typeof settings.criticalNotifications === 'boolean') setCriticalNotifications(settings.criticalNotifications);
    } catch { /* Keep default demo preferences. */ }
  }, []);

  useEffect(() => {
    if (!hasMlApiUrl()) {
      setMlConnection('unconfigured');
      return;
    }
    let isCurrent = true;
    const refresh = async () => {
      const controller = new AbortController();
      const [healthResult, feedResult] = await Promise.allSettled([
        fetchMlHealth(controller.signal),
        fetchMlPredictions(controller.signal),
      ]);
      if (!isCurrent) return;
      if (healthResult.status === 'fulfilled') {
        const health = healthResult.value;
        setMlHealth(health);
        setMlConnection(health?.status === 'ok' ? 'online' : health ? 'degraded' : 'unconfigured');
      } else {
        setMlConnection('offline');
        setMlHealth(null);
      }
      if (feedResult.status === 'fulfilled') {
        setLiveFeed(feedResult.value);
        setMlFeedError('');
      } else {
        setMlFeedError('Не удалось обновить ленту прогнозов; показан сохранённый срез.');
      }
      setLastMlSync(new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' }).format(new Date()));
    };
    void refresh();
    const interval = refreshInterval === 'manual' ? null : window.setInterval(() => void refresh(), Number(refreshInterval) * 60_000);
    return () => {
      isCurrent = false;
      if (interval !== null) window.clearInterval(interval);
    };
  }, [mlRefreshToken, refreshInterval]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(readNotificationsStorageKey);
      if (stored) setReadNotificationIds(JSON.parse(stored) as string[]);
    } catch {
      setReadNotificationIds([]);
    }
  }, []);

  useEffect(() => {
    const handleGlobalKeys = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setNotificationsOpen(false);
        setPaletteOpen(true);
      }
      if (event.key === 'Escape') {
        setPaletteOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', handleGlobalKeys);
    return () => window.removeEventListener('keydown', handleGlobalKeys);
  }, []);
  useEffect(() => {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    const useDarkTheme =
      storedTheme === 'dark' ||
      (!storedTheme &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkTheme(useDarkTheme);
    document.documentElement.dataset.theme = useDarkTheme ? 'dark' : 'light';
  }, []);
  const toggleTheme = () => {
    setDarkTheme((current) => {
      const next = !current;
      document.documentElement.dataset.theme = next ? 'dark' : 'light';
      window.localStorage.setItem(themeStorageKey, next ? 'dark' : 'light');
      return next;
    });
  };
  useEffect(() => {
    const syncLocation = () => {
      const route = parseAppPath(window.location.pathname, deploymentBasePath);
      const storedUser = loadCurrentUser();
      setSection(route.section);
      setDetail(route.detail);
      setCurrentUser(route.kind === 'login' ? null : storedUser);
      setMenuOpen(false);
      setPaletteOpen(false);
      setNotificationsOpen(false);
      if (storedUser && route.kind !== 'login') {
        if (storedUser.role === 'manager' && route.kind !== 'admin') {
          window.history.replaceState({}, '', deploymentPath('/admin/'));
        } else if (storedUser.role !== 'manager' && (route.kind === 'admin' || !roleSections[storedUser.role].includes(route.section))) {
          setSection('dashboard');
          setDetail(null);
          window.history.replaceState({}, '', deploymentPath('/dashboard/'));
        }
      }
      setAuthLoading(false);
    };
    syncLocation();
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, []);
  useEffect(() => {
    if (!currentUser || currentUser.role === 'manager') return;
    if (roleSections[currentUser.role].includes(section)) return;
    setSection('dashboard');
    setDetail(null);
    window.history.replaceState({}, '', deploymentPath('/dashboard/'));
  }, [currentUser, section]);
  const go = (next: Section, id?: string) => {
    if (currentUser && currentUser.role !== 'manager' && !roleSections[currentUser.role].includes(next)) {
      notify('У вашей роли нет доступа к этому разделу');
      return;
    }
    setSection(next);
    setDetail(id || null);
    setMenuOpen(false);
    const path = deploymentPath(sectionPath(next, id));
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };
  const quickCommands = [
    { id: 'refresh-ml', title: 'Обновить данные', description: 'Повторно запросить статус моделей и прогнозы', group: 'Быстрые действия', icon: RefreshCcw, action: () => { setMlRefreshToken((value) => value + 1); notify('Обновление ML API запрошено'); } },
    { id: 'open-notifications', title: 'Центр уведомлений', description: 'Посмотреть предупреждения и события смены', group: 'Быстрые действия', icon: Bell, action: () => setNotificationsOpen(true) },
  ];
  const commandItems = currentUser?.role === 'manager'
    ? [
        ...quickCommands,
        { id: 'accounts', title: 'Пользователи и доступ', description: 'Перейти к управлению аккаунтами', group: 'Управление', icon: Users, action: () => document.querySelector('.admin-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
        { id: 'integrations', title: 'Интеграции и ML API', description: 'Состояние сервисов и моделей', group: 'Управление', icon: Activity, action: () => document.querySelector('.admin-config-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
        { id: 'settings', title: 'Рабочие параметры', description: 'Обновление, блокировки и уведомления', group: 'Управление', icon: SlidersHorizontal, action: () => document.querySelector('.settings-check')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
      ]
    : [
        ...quickCommands,
        ...nav
          .filter((item) => !currentUser || currentUser.role === 'manager' || roleSections[currentUser.role].includes(item.id))
          .map((item) => ({ id: item.id, title: item.label, description: `Открыть раздел «${item.label.toLowerCase()}»`, group: 'Разделы', icon: item.icon, action: () => go(item.id) })),
        ...activePredictions.slice(0, 8).map((item) => ({ id: `prediction-${item.id}`, title: item.object, description: `${item.id} · ${item.type} · ${riskScoreLabel(item)} ${item.probability}%`, group: 'Прогнозы', icon: AlertTriangle, action: () => go('predictions', item.id) })),
        ...equipment.map((item) => ({ id: `equipment-${item.id}`, title: item.object, description: `${item.id} · ${item.type}`, group: 'Оборудование', icon: Factory, action: () => go('equipment', item.id) })),
      ];
  const priorityNotifications = (criticalNotifications ? activePredictions : [])
    .filter((item) => item.risk === 'Критический' || item.risk === 'Высокий')
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      title: `${item.risk} риск · ${item.object}`,
      description: `${item.type} · ${riskScoreLabel(item)} ${item.probability}% · ${item.horizon}`,
      source: usingDemoFeed ? 'Прогноз модели' : 'ML-прогноз',
      time: item.time,
      tone: item.risk === 'Критический' ? 'danger' as const : 'warning' as const,
    }));
  const notificationItems = [
    ...priorityNotifications,
    ...(mlConnection === 'offline' || mlConnection === 'degraded'
      ? [{ id: 'ml-api', title: mlConnection === 'offline' ? 'ML API недоступен' : 'ML API работает с ограничениями', description: 'Показываем последний доступный срез прогнозов.', source: 'Мониторинг ML API', time: `Проверено в ${lastMlSync}`, tone: 'warning' as const }]
      : []),
    ...(priorityNotifications.length === 0
      ? [{ id: 'system-ok', title: criticalNotifications ? 'Критических событий нет' : 'Риск-уведомления отключены', description: criticalNotifications ? 'Новые предупреждения появятся здесь после обновления ленты.' : 'Включите их в настройках руководителя; прогнозы остаются доступны в разделах.', source: 'Мониторинг', time: `Проверено в ${lastMlSync}`, tone: 'info' as const }]
      : []),
  ];
  const unreadNotificationCount = notificationItems.filter((item) => !readNotificationIds.includes(item.id) && item.id !== 'system-ok').length;
  const markNotificationRead = (id: string) => {
    const next = [...new Set([...readNotificationIds, id])];
    setReadNotificationIds(next);
    try { window.localStorage.setItem(readNotificationsStorageKey, JSON.stringify(next)); } catch { /* session state remains usable */ }
  };
  const markAllNotificationsRead = () => {
    const next = notificationItems.map((item) => item.id);
    setReadNotificationIds(next);
    try { window.localStorage.setItem(readNotificationsStorageKey, JSON.stringify(next)); } catch { /* session state remains usable */ }
  };
  if (authLoading) return <div className="auth-loading" role="status" aria-live="polite"><LoadingSkeleton rows={3} /><span>Проверяем сессию…</span></div>;
  if (!currentUser)
    return (
      <Login
        darkTheme={darkTheme}
        onToggleTheme={toggleTheme}
        onLogin={(user) => {
          setCurrentUser(user);
          storeCurrentUser(user);
          if (user.role === 'manager') {
            window.history.pushState({}, '', deploymentPath('/admin/'));
          } else {
            const pendingPath = window.sessionStorage.getItem('moscollector-demo-next');
            if (pendingPath) window.sessionStorage.removeItem('moscollector-demo-next');
            const requested = parseAppPath(pendingPath || window.location.pathname, deploymentBasePath);
            const allowed = requested.kind === 'section' && roleSections[user.role].includes(requested.section);
            go(allowed ? requested.section : 'dashboard', allowed ? requested.detail || undefined : undefined);
          }
        }}
      />
    );
  if (currentUser.role === 'manager') {
    return (
      <>
        <AdminPanel
          user={currentUser}
          darkTheme={darkTheme}
          onToggleTheme={toggleTheme}
          mlConnection={mlConnection}
          mlHealth={mlHealth}
          notificationCount={unreadNotificationCount}
          notificationsOpen={notificationsOpen}
          onOpenSearch={() => setPaletteOpen(true)}
          onToggleNotifications={() => setNotificationsOpen((current) => !current)}
          onSettingsSaved={(settings) => { setRefreshInterval(settings.refreshInterval); setCriticalNotifications(settings.criticalNotifications); }}
          onLogout={() => {
            setCurrentUser(null);
            storeCurrentUser(null);
            window.history.pushState({}, '', deploymentPath('/login/'));
          }}
        />
        <GlobalCommandPalette open={paletteOpen} commands={commandItems} onClose={() => setPaletteOpen(false)} />
        <NotificationCenter
          open={notificationsOpen}
          items={notificationItems}
          readIds={readNotificationIds}
          onClose={() => setNotificationsOpen(false)}
          onMarkAllRead={markAllNotificationsRead}
          onSelect={(id) => {
            markNotificationRead(id);
            setNotificationsOpen(false);
            if (id === 'ml-api') notify('Проверьте доступность ML API и конфигурацию моделей');
            else if (id !== 'system-ok' && activePredictions.some((item) => item.id === id)) go('predictions', id);
            else if (id !== 'system-ok') notify('Прогноз уже не доступен в текущей ленте; откройте раздел «Прогнозы»');
          }}
        />
      </>
    );
  }
  const currentRole = currentUser.role as Exclude<UserRole, 'manager'>;
  const visibleNav = nav.filter((item) => roleSections[currentRole].includes(item.id));
  return (
    <div className={`app-shell${sidebarCollapsed ? ' is-collapsed' : ''}`}>
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={19} />
          </div>
          <div>
            <strong>МосКоллектор</strong>
            <span>Ситуационный центр</span>
          </div>
          <button className="sidebar-collapse" type="button" aria-label={sidebarCollapsed ? 'Развернуть боковую панель' : 'Свернуть боковую панель'} title={sidebarCollapsed ? 'Развернуть панель' : 'Свернуть панель'} onClick={toggleSidebar}>
            {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>
        <nav className="main-nav" aria-label="Основная навигация">
          <span className="nav-caption">Мониторинг</span>
          {visibleNav.filter((item) => ['dashboard', 'map', 'predictions'].includes(item.id)).map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={section === item.id}
              count={item.id === 'predictions' ? activePredictions.length : undefined}
              onClick={() => go(item.id)}
            />
          ))}
          <span className="nav-caption nav-caption-second">Операции</span>
          {visibleNav.filter((item) => ['equipment', 'maintenance', 'schedule'].includes(item.id)).map((item) => (
            <NavButton key={item.id} item={item} active={section === item.id} onClick={() => go(item.id)} />
          ))}
          {visibleNav.some((item) => ['analytics', 'incidents'].includes(item.id)) && <span className="nav-caption nav-caption-second">Анализ</span>}
          {visibleNav.filter((item) => ['analytics', 'incidents'].includes(item.id)).map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={section === item.id}
              count={item.id === 'predictions' ? activePredictions.length : undefined}
              onClick={() => go(item.id)}
            />
          ))}
        </nav>
        <button
          className="profile"
          onClick={() => {
            setCurrentUser(null);
            storeCurrentUser(null);
            window.history.pushState({}, '', deploymentPath('/login/'));
          }}
        >
          <span className="avatar">
            {currentUser.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </span>
          <span>
            <strong>{currentUser.name}</strong>
            <small>{roleLabels[currentUser.role]}</small>
          </span>
          <LogOut size={16} />
        </button>
      </aside>
      <main className="main">
        <Header
          section={section}
          user={currentUser}
          darkTheme={darkTheme}
          menuOpen={menuOpen}
          onToggleTheme={toggleTheme}
          onMenu={() => setMenuOpen(!menuOpen)}
          onOpenSearch={() => setPaletteOpen(true)}
          onToggleNotifications={() => setNotificationsOpen((current) => !current)}
          notificationCount={unreadNotificationCount}
          notificationsOpen={notificationsOpen}
          mlConnection={mlConnection}
          usingDemoFeed={usingDemoFeed}
        />
        <div className="content">
          {section === 'dashboard' && (
            <Dashboard
              go={go}
              notify={notify}
              user={currentUser}
              activePredictions={activePredictions}
              usingDemoFeed={usingDemoFeed}
              mlConnection={mlConnection}
              mlHealth={mlHealth}
              mlFeedError={mlFeedError}
              lastMlSync={lastMlSync}
              refreshInterval={refreshInterval}
              onRefresh={() => setMlRefreshToken((current) => current + 1)}
            />
          )}
          {section === 'map' && <MapPage go={go} notify={notify} user={currentUser} selectedObjectId={detail} />}
          {section === 'predictions' &&
            (detail ? (
              <PredictionDetail
                id={detail}
                go={go}
                notify={notify}
                dispatcher={currentUser}
                livePredictions={activePredictions}
                liveContexts={liveFeed.contexts}
              />
            ) : (
              <Predictions go={go} notify={notify} user={currentUser} activePredictions={activePredictions} usingDemoFeed={usingDemoFeed} />
            ))}
          {section === 'incidents' && <Incidents notify={notify} />}
          {section === 'equipment' &&
            (detail ? (
              <EquipmentDetail id={detail} go={go} notify={notify} />
            ) : (
              <EquipmentPage go={go} notify={notify} />
            ))}
          {section === 'maintenance' && <Maintenance notify={notify} user={currentUser} openRequestId={detail} onSwitchRole={(next) => { window.sessionStorage.setItem('moscollector-demo-next', next === 'analytics' ? '/analytics/' : sectionPath('maintenance', detail)); setCurrentUser(null); storeCurrentUser(null); window.history.pushState({}, '', deploymentPath('/login/')); }} />}
          {section === 'schedule' && <MaintenancePlan />}
          {section === 'analytics' && <Analytics notify={notify} go={go} />}
        </div>
      </main>
      {menuOpen && (
        <button
          aria-label="Закрыть меню"
          className="menu-backdrop"
          onClick={() => setMenuOpen(false)}
        />
      )}
      {toast && (
        <div className="toast">
          <span>
            <Check size={16} />
          </span>
          {toast}
        </div>
      )}
      <GlobalCommandPalette open={paletteOpen} commands={commandItems} onClose={() => setPaletteOpen(false)} />
      <NotificationCenter
        open={notificationsOpen}
        items={notificationItems}
        readIds={readNotificationIds}
        onClose={() => setNotificationsOpen(false)}
        onMarkAllRead={markAllNotificationsRead}
        onSelect={(id) => {
          markNotificationRead(id);
          setNotificationsOpen(false);
          if (id === 'ml-api') notify('Проверьте доступность ML API и конфигурацию моделей');
          else if (id !== 'system-ok' && activePredictions.some((item) => item.id === id)) go('predictions', id);
          else if (id !== 'system-ok') notify('Прогноз уже не доступен в текущей ленте; откройте раздел «Прогнозы»');
        }}
      />
    </div>
  );
}
