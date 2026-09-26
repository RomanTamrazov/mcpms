'use client';
import { useEffect, useState } from 'react';
import { Activity, Bell, Check, LogOut, Pencil, Search, ShieldCheck, SlidersHorizontal, Trash2, UserPlus, Users } from 'lucide-react';
import { StatusBadge } from '@/components/ui/enterprise';
import { type MlHealth } from '@/lib/ml-api';
import { UserRole, UserAccount, roleLabels, managerAccount, loadDispatcherAccounts, storeDispatcherAccounts, MlConnectionState, connectionLabel } from './moscollector-core';
import { ThemeToggle, PageHead } from './moscollector-layout';
import { BrandIdentity } from './moscollector-brand';


export function AdminPanel({
  user,
  darkTheme,
  onToggleTheme,
  mlConnection,
  mlHealth,
  notificationCount,
  notificationsOpen,
  onOpenSearch,
  onToggleNotifications,
  onSettingsSaved,
  onLogout,
}: {
  user: UserAccount;
  darkTheme: boolean;
  onToggleTheme: () => void;
  mlConnection: MlConnectionState;
  mlHealth: MlHealth | null;
  notificationCount: number;
  notificationsOpen: boolean;
  onOpenSearch: () => void;
  onToggleNotifications: () => void;
  onSettingsSaved: (settings: { refreshInterval: string; criticalNotifications: boolean }) => void;
  onLogout: () => void;
}) {
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('dispatcher');
  const [unit, setUnit] = useState('Центральная ОДС');
  const [district, setDistrict] = useState('Все округа');
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState('0.5');
  const [criticalNotifications, setCriticalNotifications] = useState(true);

  useEffect(() => {
    setAccounts(loadDispatcherAccounts());
    try {
      const stored = window.localStorage.getItem('moscollector-ui-settings');
      if (stored) {
        const settings = JSON.parse(stored) as { refreshInterval?: string; criticalNotifications?: boolean };
        if (settings.refreshInterval) setRefreshInterval(settings.refreshInterval);
        if (typeof settings.criticalNotifications === 'boolean') setCriticalNotifications(settings.criticalNotifications);
      }
    } catch {
      // Keep default demo settings when browser storage is unavailable.
    }
  }, []);

  const saveAccount = (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (
      normalizedEmail === managerAccount.email ||
      accounts.some(
        (account) =>
          account.id !== editingId &&
          account.email.toLowerCase() === normalizedEmail,
      )
    ) {
      setMessage('Аккаунт с такой почтой уже существует');
      return;
    }
    const account: UserAccount = {
      id: editingId || `user-${Date.now()}`,
      name: name.trim(),
      email: normalizedEmail,
      password,
      role,
      unit: unit.trim(),
      district,
      active,
    };
    const next = editingId
      ? accounts.map((item) => (item.id === editingId ? account : item))
      : [account, ...accounts];
    setAccounts(next);
    storeDispatcherAccounts(next);
    setName('');
    setEmail('');
    setPassword('');
    setRole('dispatcher');
    setUnit('Центральная ОДС');
    setDistrict('Все округа');
    setActive(true);
    setEditingId(null);
    setMessage(
      editingId
        ? `Данные аккаунта ${account.name} обновлены`
        : `Аккаунт ${account.name} создан`,
    );
  };

  const editAccount = (account: UserAccount) => {
    setEditingId(account.id);
    setName(account.name);
    setEmail(account.email);
    setPassword(account.password);
    setRole(account.role);
    setUnit(account.unit);
    setDistrict(account.district);
    setActive(account.active);
    setMessage(`Редактирование аккаунта ${account.name}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('dispatcher');
    setUnit('Центральная ОДС');
    setDistrict('Все округа');
    setActive(true);
    setMessage('Редактирование отменено');
  };

  const deleteAccount = (account: UserAccount) => {
    if (!window.confirm(`Удалить аккаунт «${account.name}»?`)) return;
    const next = accounts.filter((item) => item.id !== account.id);
    setAccounts(next);
    storeDispatcherAccounts(next);
    if (editingId === account.id) {
      setEditingId(null);
      setName('');
      setEmail('');
      setPassword('');
    }
    setMessage(`Аккаунт ${account.name} удалён`);
  };

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <BrandIdentity />
        </div>
        <div className="admin-profile">
          <button className="command-trigger" onClick={onOpenSearch} aria-label="Поиск по системе, Control или Command K">
            <Search size={16} /><span>Поиск</span><kbd>⌘ K</kbd>
          </button>
          <StatusBadge tone={mlConnection === 'online' ? 'success' : mlConnection === 'degraded' || mlConnection === 'offline' ? 'warning' : 'neutral'} className="topbar-system-status">
            <i className={`system-dot ${mlConnection}`} />{connectionLabel(mlConnection)}
          </StatusBadge>
          <button className="icon-btn notification" type="button" aria-label={`Открыть центр уведомлений, непрочитанных: ${notificationCount}`} aria-expanded={notificationsOpen} onClick={onToggleNotifications}>
            <Bell size={18} />{notificationCount > 0 && <b>{notificationCount > 9 ? '9+' : notificationCount}</b>}
          </button>
          <ThemeToggle darkTheme={darkTheme} onToggle={onToggleTheme} />
          <span>
            <strong>{user.name}</strong>
            <small>{roleLabels[user.role]}</small>
          </span>
          <button className="secondary-btn" onClick={onLogout}>
            <LogOut size={16} /> Выйти
          </button>
        </div>
      </header>
      <main className="admin-content">
        <PageHead
          title="Пользователи и доступ"
          subtitle="Роли, подразделения и области ответственности"
        />
        {message && <div className="admin-message">{message}</div>}
        <div className="admin-grid">
          <form className="panel admin-form" onSubmit={saveAccount}>
            <div className="admin-section-head">
              <span className="metric-icon purple">
                <UserPlus size={20} />
              </span>
              <div>
                <h3>{editingId ? 'Редактирование' : 'Новый пользователь'}</h3>
                <p>
                  {editingId
                    ? 'Измените данные учётной записи'
                    : 'Укажите данные для входа сотрудника'}
                </p>
              </div>
            </div>
            <label>
              <span>Имя и фамилия</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, Иван Орлов"
                required
              />
            </label>
            <label>
              <span>Роль</span>
              <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                <option value="dispatcher">Диспетчер ОДС или эксплуатационного подразделения</option>
                <option value="technician">Технический персонал по обслуживанию коллекторов</option>
                <option value="manager">Руководитель эксплуатационного подразделения</option>
              </select>
            </label>
            <label>
              <span>Подразделение</span>
              <input value={unit} onChange={(event) => setUnit(event.target.value)} required />
            </label>
            <label>
              <span>Область доступа</span>
              <select value={district} onChange={(event) => setDistrict(event.target.value)}>
                <option>Все округа</option><option>ЦАО</option><option>ЮАО</option><option>СВАО</option><option>ЮВАО</option><option>ЗАО</option>
              </select>
            </label>
            <label className="admin-active-check">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              <span>Учётная запись активна</span>
            </label>
            <label>
              <span>Рабочая почта</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="dispatcher@moscollector.ru"
                required
              />
            </label>
            <label>
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                placeholder="Минимум 6 символов"
                required
              />
            </label>
            <div className="admin-form-actions">
              {editingId && (
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={cancelEditing}
                >
                  Отмена
                </button>
              )}
              <button className="primary-btn" type="submit">
                {editingId ? <Check size={16} /> : <UserPlus size={16} />}
                {editingId ? 'Сохранить изменения' : 'Создать аккаунт'}
              </button>
            </div>
          </form>
          <section className="panel admin-list">
            <div className="admin-section-head">
              <span className="metric-icon purple">
                <Users size={20} />
              </span>
              <div>
                <h3>Пользователи</h3>
                <p>Активных аккаунтов: {accounts.filter((account) => account.active).length} из {accounts.length}</p>
              </div>
            </div>
            <div className="account-list">
              {accounts.map((account) => (
                <article key={account.id}>
                  <span className="avatar">
                    {account.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <span className="account-copy">
                    <strong>{account.name}</strong>
                    <small>{account.email} · {account.unit}</small>
                  </span>
                  <span className={`status-badge ${account.active ? 'status-success' : 'status-neutral'}`}>
                    {account.active ? roleLabels[account.role] : 'Заблокирован'}
                  </span>
                  <button
                    className="edit-account"
                    onClick={() => editAccount(account)}
                    aria-label={`Редактировать аккаунт ${account.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="delete-account"
                    onClick={() => deleteAccount(account)}
                    aria-label={`Удалить аккаунт ${account.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
              {accounts.length === 0 && (
                <div className="column-empty">
                  <Users size={22} />
                  <strong>Нет пользовательских аккаунтов</strong>
                </div>
              )}
            </div>
          </section>
        </div>
        <div className="admin-config-grid">
          <section className="panel admin-config-card">
            <div className="admin-section-head">
              <span className="metric-icon green"><Activity size={20} /></span>
              <div><h3>Интеграции</h3><p>Состояние подключённых сервисов</p></div>
            </div>
            <div className="integration-list">
              <div><span><i className="source-ok" />СМВУ</span><b>Поток мониторинга · read-only</b></div>
              <div><span><i className="source-ok" />Реестр оборудования</span><b>Синхронизирован</b></div>
              <div><span><i className="source-mock" />Журнал ОДС</span><b>Имитатор REST API</b></div>
              <div><span><i className="source-mock" />Система заявок</span><b>Имитатор REST API</b></div>
              <div><span><i className={mlConnection === 'online' ? 'source-ok' : 'source-wait'} />ML API</span><b>{connectionLabel(mlConnection)}</b></div>
              {mlHealth?.models.map((model) => (
                <div key={model.id}><span><i className={model.status === 'ready' ? 'source-ok' : 'source-wait'} />{model.display_name}</span><b>{model.status === 'ready' ? 'Готова' : model.status === 'not_configured' ? 'Не настроена' : model.status === 'error' ? 'Ошибка загрузки' : 'Ограниченный режим'}</b></div>
              ))}
            </div>
          </section>
          <section className="panel admin-config-card">
            <div className="admin-section-head">
              <span className="metric-icon purple"><SlidersHorizontal size={20} /></span>
              <div><h3>Рабочие параметры</h3><p>Локальные настройки этого браузера</p></div>
            </div>
            <label><span>Обновление ленты ML API</span><select value={refreshInterval} onChange={(event) => setRefreshInterval(event.target.value)}><option value="0.5">Каждые 30 секунд</option><option value="1">Каждую минуту</option><option value="5">Каждые 5 минут</option><option value="15">Каждые 15 минут</option><option value="manual">Вручную</option></select></label>
            <label className="settings-check" htmlFor="claim-lock" aria-label="Блокировка обработки"><input id="claim-lock" type="checkbox" checked disabled readOnly /><span><strong>Блокировка обработки</strong><small>Включена в этом браузере. Для межпользовательской блокировки требуется backend.</small></span></label>
            <label className="settings-check" htmlFor="critical-notifications" aria-label="Критические уведомления"><input id="critical-notifications" type="checkbox" checked={criticalNotifications} onChange={(event) => setCriticalNotifications(event.target.checked)} /><span><strong>Критические уведомления</strong><small>Показывать уведомления внутри приложения</small></span></label>
            <button className="primary-btn" onClick={() => {
              window.localStorage.setItem('moscollector-ui-settings', JSON.stringify({ refreshInterval, criticalNotifications }));
              onSettingsSaved({ refreshInterval, criticalNotifications });
              setMessage('Рабочие параметры сохранены');
            }}><Check size={16} />Сохранить параметры</button>
          </section>
          <section className="panel admin-config-card audit-card">
            <div className="admin-section-head">
              <span className="metric-icon yellow"><ShieldCheck size={20} /></span>
              <div><h3>Аудит действий</h3><p>Последние события системы</p></div>
            </div>
            <div className="audit-list">
              <p><strong>Вход руководителя</strong><span>Только что · {user.name}</span></p>
              <p><strong>Синхронизация реестра</strong><span>12 минут назад · системное событие</span></p>
              <p><strong>Изменён статус заявки RQ-1086</strong><span>Сегодня, 08:05 · Бригада №7</span></p>
              <p><strong>Создано решение по PR-2491</strong><span>Сегодня, 07:48 · диспетчер ОДС</span></p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
