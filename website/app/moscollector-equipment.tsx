'use client';
import { useEffect, useRef, useState } from 'react';
import { type Section } from '@/lib/app-routes';
import { parseEquipmentCsv, type EquipmentImportPreview, type EquipmentImportRow } from '@/lib/equipment-import';
import { Activity, AlertTriangle, ArrowLeft, CalendarClock, ChevronRight, CircleGauge, Download, Gauge, Search, ShieldCheck, Siren, Thermometer, Wrench } from 'lucide-react';
import { EmptyState, LoadingSkeleton, SectionCard } from '@/components/ui/enterprise';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SentRequest, loadSentRequests, storeSentRequests, equipment, loadImportedEquipment, storeImportedEquipment, sensorData, riskClass, riskFromNumber, downloadFile } from './moscollector-core';
import { PageHead, Metric, PanelHead } from './moscollector-layout';


export function EquipmentPage({
  go,
  notify,
}: {
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('Все состояния');
  const [importInfo, setImportInfo] = useState('');
  const [importPreview, setImportPreview] = useState<EquipmentImportPreview | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [importedEquipment, setImportedEquipment] = useState<EquipmentImportRow[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setImportedEquipment(loadImportedEquipment()), []);
  const allEquipment = [...importedEquipment, ...equipment.filter((item) => !importedEquipment.some((imported) => imported.id === item.id))];
  const visibleEquipment = allEquipment.filter(
    (item) =>
      (state === 'Все состояния' || item.state === state) &&
      `${item.id} ${item.object} ${item.type}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const exportEquipment = () => {
    const csvField = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [
      'ID;Объект;Тип;Состояние;Значение;Риск;Последнее ТО;Следующее ТО',
      ...allEquipment.map(
        (e) =>
          [e.id, e.object, e.type, e.state, e.value, `${e.risk}%`, e.last, e.next].map(csvField).join(';'),
      ),
    ].join('\n');
    downloadFile('equipment.csv', `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    notify('Реестр оборудования выгружен');
  };
  const importRegistry = async (file?: File) => {
    if (!file) return;
    setImportPreview(null);
    setImportFileName(file.name);
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx'].includes(extension || '')) {
      setImportInfo('Интерфейс принимает CSV в UTF-8. Для XLSX нужен серверный импортёр.');
      return;
    }
    if (file.size > 2_000_000) { setImportInfo('Файл больше 2 МБ. Выберите CSV меньшего размера.'); return; }
    if (extension === 'csv') {
      try {
        const preview = parseEquipmentCsv(await file.text());
        setImportPreview(preview);
        setImportInfo(preview.errors.length ? `Найдено ошибок: ${preview.errors.length}. Исправьте CSV и выберите файл повторно.` : `Проверено ${preview.rowCount} строк. Данные пока не сохранены.`);
      } catch { setImportInfo('Не удалось прочитать CSV. Проверьте кодировку UTF-8.'); }
    } else {
      setImportInfo('XLSX: серверный импортёр не подключён; используйте CSV в UTF-8 для локального предпросмотра и сохранения.');
    }
  };
  const confirmImport = () => {
    if (!importPreview || importPreview.errors.length || !importPreview.rows.length) return;
    const merged = [...importPreview.rows, ...importedEquipment.filter((item) => !importPreview.rows.some((row) => row.id === item.id))];
    setImportedEquipment(merged);
    storeImportedEquipment(merged);
    setImportInfo(`${importPreview.rows.length} записей сохранено в локальном реестре этого браузера. На сервер данные не передавались.`);
    setImportPreview(null);
    notify('Реестр оборудования обновлён');
  };
  return (
    <>
      <PageHead
        title="Оборудование"
        subtitle={`Реестр оборудования · ${allEquipment.length} карточек доступно`}
        action={<div className="inline-actions">
          <input ref={importInputRef} className="sr-only" type="file" accept=".csv,text/csv" aria-label="Выбрать CSV файл" onChange={(event) => { void importRegistry(event.target.files?.[0]); event.target.value = ''; }} />
          <button className="secondary-btn" type="button" onClick={() => importInputRef.current?.click()}>Импорт CSV</button>
          <button className="secondary-btn" onClick={exportEquipment}><Download size={16} /> Экспорт реестра</button>
        </div>}
      />
      <p className="muted-note">CSV проверяется до сохранения и остаётся только в этом браузере. XLSX пока не импортируется: для него требуется серверная обработка.</p>
      {importInfo && <div className="import-status" role="status"><Activity size={17} /><span><strong>{importFileName || 'Импорт данных'}</strong>{importInfo}</span><button type="button" aria-label="Закрыть результат импорта" onClick={() => { setImportInfo(''); setImportPreview(null); }}>Закрыть</button></div>}
      {importPreview && <section className="panel import-preview" aria-label="Предпросмотр CSV"><div className="import-preview-head"><div><strong>Предпросмотр CSV · {importPreview.rowCount} строк</strong><span>{importPreview.rows.length} корректных · {importPreview.errors.length} ошибок</span></div><button className="primary-btn" type="button" disabled={importPreview.errors.length > 0 || importPreview.rows.length === 0} onClick={confirmImport}>Сохранить в реестр</button></div>{importPreview.errors.length > 0 && <ul className="import-preview-errors">{importPreview.errors.map((error) => <li key={error}>{error}</li>)}</ul>}<div className="table-scroll"><table><thead><tr><th>ID</th><th>Объект</th><th>Тип</th><th>Состояние</th><th>Риск</th></tr></thead><tbody>{importPreview.rows.slice(0, 5).map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.object}</td><td>{row.type}</td><td>{row.state}</td><td>{row.risk}%</td></tr>)}</tbody></table></div>{importPreview.rows.length > 5 && <small>Показаны первые 5 корректных строк.</small>}</section>}
      <div className="metric-grid four">
        <Metric
          icon={ShieldCheck}
          label="Исправно"
          value="12 074"
          note="96,8% реестра"
          tone="green"
          trend="+18 за месяц"
        />
        <Metric
          icon={AlertTriangle}
          label="Требует внимания"
          value="301"
          note="2,4% реестра"
          tone="yellow"
          trend="−12 за неделю"
        />
        <Metric
          icon={Siren}
          label="Критическое"
          value="97"
          note="0,8% реестра"
          tone="red"
          trend="+3 сегодня"
        />
        <Metric
          icon={CalendarClock}
          label="ТО на 7 дней"
          value="64"
          note="18 приоритетных"
          tone="purple"
          trend="По графику"
        />
      </div>
      <div className="panel table-panel">
        <div className="table-tools">
          <label className="search-field">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ID, объект или тип оборудования"
            />
          </label>
          <select
            className="select-btn"
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label="Состояние оборудования"
          >
            <option>Все состояния</option>
            <option>Требует внимания</option>
            <option>Нестабильно</option>
            <option>Работает</option>
            <option>Исправно</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  'ID / объект',
                  'Тип',
                  'Состояние',
                  'Последнее значение',
                  'Риск отказа',
                  'Последнее ТО',
                  'Следующее ТО',
                  '',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEquipment.map((e) => (
                <tr key={e.id} role="button" tabIndex={0} aria-label={`Открыть оборудование ${e.id}: ${e.object}`} onClick={() => go('equipment', e.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); go('equipment', e.id); } }}>
                  <td>
                    <strong>{e.id}</strong>
                    <small>{e.object}</small>
                  </td>
                  <td>{e.type}</td>
                  <td>
                    <span className="status-badge">{e.state}</span>
                  </td>
                  <td>
                    <strong>{e.value}</strong>
                  </td>
                  <td>
                    <span className={riskClass(riskFromNumber(e.risk))}>
                      <i />
                      {e.risk}%
                    </span>
                  </td>
                  <td>{e.last}</td>
                  <td>{e.next}</td>
                  <td>
                    <ChevronRight size={17} />
                  </td>
                </tr>
              ))}
              {visibleEquipment.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    Оборудование не найдено
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}



export function EquipmentDetail({
  id,
  go,
  notify,
}: {
  id: string;
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
}) {
  const [importedRecord, setImportedRecord] = useState<EquipmentImportRow | null>(null);
  const [importChecked, setImportChecked] = useState(false);
  useEffect(() => {
    setImportedRecord(loadImportedEquipment().find((item) => item.id === id) || null);
    setImportChecked(true);
  }, [id]);
  const item = equipment.find((record) => record.id === id) || importedRecord;
  const planMaintenance = () => {
    if (!item) return;
    const existing = loadSentRequests().find((request) => request.id === item.id);
    if (existing) { go('maintenance', existing.requestId); return; }
    const at = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const request: SentRequest = {
      id: item.id,
      risk: riskFromNumber(item.risk),
      probability: item.risk,
      object: item.object,
      title: `ТО: ${item.type}`,
      deadline: 'В течение текущей смены',
      requestId: `RQ-${Date.now().toString().slice(-6)}`,
      sentAt: at,
      status: 'Отправлена',
      assignedUnit: 'Эксплуатационное подразделение',
      dispatcherComment: 'Заявка создана из карточки оборудования',
      statusHistory: [{ status: 'Отправлена', at, author: 'Реестр оборудования' }],
    };
    storeSentRequests([request, ...loadSentRequests()]);
    notify(`Заявка ${request.requestId} сохранена в браузере`);
    go('maintenance', request.requestId);
  };
  if (!item && !importChecked) return <LoadingSkeleton rows={4} />;
  if (!item) return <EmptyState title="Оборудование не найдено" description="Проверьте ID или откройте реестр." action={<button className="secondary-btn" onClick={() => go('equipment')}>К реестру</button>} />;
  if (item.id !== 'EQ-1034') return <>
    <button className="back-btn" onClick={() => go('equipment')}><ArrowLeft size={17} /> Всё оборудование</button>
    <PageHead title={item.type} subtitle={`${item.id} · ${item.object} · карточка оборудования`} action={<button className="primary-btn" onClick={planMaintenance}><Wrench size={16} /> Запланировать ТО</button>} />
    <div className="metric-grid four"><Metric icon={CircleGauge} label="Оценка риска" value={`${item.risk}%`} note="по данным реестра" tone={item.risk >= 70 ? 'red' : 'purple'} trend="текущий" /><Metric icon={ShieldCheck} label="Состояние" value={item.state} note="из реестра" tone="purple" trend="текущий" /><Metric icon={Activity} label="Последнее значение" value={item.value} note="без временного ряда" tone="purple" trend="текущий" /><Metric icon={CalendarClock} label="Следующее ТО" value={item.next} note={`Последнее: ${item.last}`} tone="purple" trend="текущий" /></div>
    <SectionCard title="Телеметрия и история работ" description="Сервис оборудования пока передаёт только поля реестра"><EmptyState title="Подробные данные не подключены" description="График, аномалии и историю обслуживания для этой карточки нельзя достоверно показать без API телеметрии." /></SectionCard>
  </>;
  return (
    <>
      <button className="back-btn" onClick={() => go('equipment')}>
        <ArrowLeft size={17} /> Всё оборудование
      </button>
      <div className="detail-head">
        <div>
          <div className="detail-kicker">
            <span className="risk risk-критический">
              <i />
              Требует внимания
            </span>
            <span>{id}</span>
          </div>
          <h2>{item.type} — №3</h2>
          <p>{item.object} · карточка оборудования</p>
        </div>
        <button
          className="primary-btn"
          onClick={planMaintenance}
        >
          <Wrench size={16} /> Запланировать ТО
        </button>
      </div>
      <div className="metric-grid four">
        <Metric
          icon={Thermometer}
          label="Температура"
          value="87 °C"
          note="Порог 80 °C"
          tone="red"
          trend="+9 °C за 2 ч"
        />
        <Metric
          icon={Activity}
          label="Вибрация"
          value="5,6 мм/с"
          note="Порог 4,5 мм/с"
          tone="orange"
          trend="+18%"
        />
        <Metric
          icon={Gauge}
          label="Давление"
          value="3,7 бар"
          note="Норма 4,2–5,1"
          tone="yellow"
          trend="−0,5 бар"
        />
        <Metric
          icon={CircleGauge}
          label="Риск отказа"
          value="94%"
          note="Горизонт 6 часов"
          tone="red"
          trend="Критический"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <PanelHead
            title="История показаний"
            subtitle="Температура · последние 12 часов"
          />
          <div className="chart-wrap large-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 280 }}>
              <LineChart data={sensorData}>
                <CartesianGrid vertical={false} stroke="#eeedf3" />
                <XAxis dataKey="t" axisLine={false} />
                <YAxis domain={[50, 95]} axisLine={false} />
                <Tooltip />
                <Line
                  dataKey="temp"
                  stroke="#6246D9"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <PanelHead title="Аномалии" subtitle="За последние 30 дней" />
          <div className="timeline">
            <TimelineItem
              date="Сегодня, 09:42"
              title="Температура выше порога"
              text="87 °C при пороге 80 °C"
              tone="red"
            />
            <TimelineItem
              date="Сегодня, 08:16"
              title="Рост вибрации"
              text="Увеличение на 18% за 90 минут"
              tone="orange"
            />
            <TimelineItem
              date="12 сентября"
              title="Кратковременный скачок"
              text="Автоматически нормализован"
              tone="yellow"
            />
          </div>
        </section>
        <section className="panel latest-panel">
          <PanelHead
            title="История обслуживания"
            subtitle="Последние работы по оборудованию"
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Работа</th>
                  <th>Исполнитель</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>12.08.2026</td>
                  <td>Плановое ТО</td>
                  <td>Бригада №14</td>
                  <td>
                    <span className="status-badge">Выполнено</span>
                  </td>
                </tr>
                <tr>
                  <td>18.05.2026</td>
                  <td>Замена уплотнений</td>
                  <td>АО «Мосводоканал»</td>
                  <td>
                    <span className="status-badge">Выполнено</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}


export function TimelineItem({
  date,
  title,
  text,
  tone,
}: {
  date: string;
  title: string;
  text: string;
  tone: string;
}) {
  return (
    <div className="timeline-item">
      <i className={tone} />
      <span>
        <small>{date}</small>
        <strong>{title}</strong>
        <p>{text}</p>
      </span>
    </div>
  );
}
