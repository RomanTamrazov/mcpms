'use client';
import { useState } from 'react';
import { Building2, ChevronRight, ShieldCheck } from 'lucide-react';
import { UserAccount, managerAccount, defaultDispatcherAccounts, loadDispatcherAccounts } from './moscollector-core';
import { ThemeToggle } from './moscollector-layout';


export function Login({
  darkTheme,
  onToggleTheme,
  onLogin,
}: {
  darkTheme: boolean;
  onToggleTheme: () => void;
  onLogin: (user: UserAccount) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [help, setHelp] = useState(false);
  const [email, setEmail] = useState('dispatcher@moscollector.ru');
  const [password, setPassword] = useState('monitoring2026');
  const [error, setError] = useState('');
  return (
    <div className="login-page">
      <div className="login-theme-toggle">
        <ThemeToggle darkTheme={darkTheme} onToggle={onToggleTheme} />
      </div>
      <div className="login-aside">
        <div className="brand login-brand">
          <div className="brand-mark">
            <Building2 size={20} />
          </div>
          <div>
            <strong>МосКоллектор</strong>
            <span>Правительство Москвы</span>
          </div>
        </div>
        <div>
          <span className="login-tag">
            <ShieldCheck size={16} /> Единый контур мониторинга
          </span>
          <h1>
            Инфраструктура под контролем.
            <br />
            Решения — за человеком.
          </h1>
          <p>
            Прогнозирование рисков и поддержка диспетчерских решений на объектах
            городской инженерной инфраструктуры.
          </p>
        </div>
        <div className="login-stats">
          <div>
            <strong>1 247</strong>
            <span>объектов онлайн</span>
          </div>
          <div>
            <strong>12 472</strong>
            <span>единицы оборудования</span>
          </div>
        </div>
      </div>
      <main className="login-main">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setError('');
            window.setTimeout(() => {
              const account = [managerAccount, ...loadDispatcherAccounts()].find(
                (item) =>
                  item.email.toLowerCase() === email.trim().toLowerCase() &&
                  item.password === password,
              );
              setLoading(false);
              if (account?.active) onLogin(account);
              else if (account && !account.active) setError('Учётная запись заблокирована руководителем подразделения');
              else setError('Неверная почта или пароль');
            }, 450);
          }}
        >
          <div className="login-mobile-brand">
            <div className="brand-mark">
              <Building2 size={19} />
            </div>
            <strong>МосКоллектор</strong>
          </div>
          <p className="eyebrow">Демонстрационный доступ</p>
          <h2>Вход в систему</h2>
          <p>Роли в конкурсной версии работают локально в браузере. Для промышленного доступа требуется интеграция с LDAP/AD.</p>
          <label>
            <span>Рабочая почта</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <div className="login-options">
            <span>Демо-сессия сохраняется в этом браузере</span>
            <button type="button" onClick={() => setHelp(!help)}>
              Забыли пароль?
            </button>
          </div>
          {help && (
            <div className="login-message">
              Выберите демо-роль ниже: учётные данные автоматически появятся в форме.
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <div className="demo-login-list">
            <span>Демо-роли</span>
            {[
              ['Диспетчер', defaultDispatcherAccounts[0]],
              ['Технический персонал', defaultDispatcherAccounts[2]],
              ['Руководитель', managerAccount],
            ].map(([label, account]) => (
              <button key={(account as UserAccount).id} type="button" onClick={() => {
                setEmail((account as UserAccount).email);
                setPassword((account as UserAccount).password);
                setError('');
              }}>{label as string}</button>
            ))}
          </div>
          <button className="primary-btn login-submit" disabled={loading}>
            {loading ? 'Проверяем данные…' : 'Войти в систему'}
            <ChevronRight size={17} />
          </button>
          <div className="login-help">
            <ShieldCheck size={17} />
            <span>
              Демонстрационные учётные записи не предоставляют доступ к промышленным данным.
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}
