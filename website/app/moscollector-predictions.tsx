'use client';
import { useEffect, useMemo, useState } from 'react';
import { type Section } from '@/lib/app-routes';
import { Activity, ArrowLeft, Check, ChevronRight, Download, Factory, Gauge, Map, MoreHorizontal, Search, Send, ShieldCheck, Sparkles, Thermometer, TrendingUp, Users, X, type LucideIcon } from 'lucide-react';
import { DataTable, EmptyState, FilterBar, RiskBadge, StatusBadge } from '@/components/ui/enterprise';
import { type MlPredictionFeed } from '@/lib/ml-api';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { UserAccount, PredictionRecord, predictions, SentRequest, loadSentRequests, storeSentRequests, journalStatus, journalFact, storeJournalEntry, equipment, mapObjects, sensorData, predictionContexts, defaultPredictionContext, riskClass, riskScoreLabel, downloadFile } from './moscollector-core';
import { PageHead, PanelHead } from './moscollector-layout';


export function Predictions({
  go,
  notify,
  user,
  activePredictions,
  usingDemoFeed,
}: {
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
  user: UserAccount;
  activePredictions: PredictionRecord[];
  usingDemoFeed: boolean;
}) {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('risk');
  const visiblePredictions = useMemo(() => activePredictions
    .filter((prediction) => user.district === 'Все округа' || prediction.district === user.district)
    .filter((prediction) => riskFilter === 'all' || prediction.risk === riskFilter)
    .filter((prediction) => `${prediction.id} ${prediction.object} ${prediction.district} ${prediction.type}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => sortOrder === 'probability-asc' ? a.probability - b.probability : sortOrder === 'name' ? a.object.localeCompare(b.object, 'ru') : b.probability - a.probability),
  [activePredictions, query, riskFilter, sortOrder, user.district]);
  const pageSize = 6;
  const pageCount = Math.max(1, Math.ceil(visiblePredictions.length / pageSize));
  const pageRows = visiblePredictions.slice((page - 1) * pageSize, page * pageSize);
  const changePage = (next: number) => {
    const safePage = Math.max(1, Math.min(pageCount, next));
    setPage(safePage);
    notify(`Открыта страница ${safePage}`);
  };
  const exportRows = () => {
    const csv = [
      'ID;Объект;Инцидент;Оценка риска, %;Уровень риска;Горизонт',
      ...visiblePredictions.map(
        (p) =>
          `${p.id};${p.object};${p.type};${p.probability}%;${p.risk};${p.horizon}`,
      ),
    ].join('\n');
    downloadFile('predictions.csv', `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    notify('Прогнозы выгружены в CSV');
  };
  return (
    <>
      <PageHead
        title="Прогнозы инцидентов"
        subtitle={`${visiblePredictions.length} записей · область: ${user.district} · ${usingDemoFeed ? 'демонстрационный набор' : 'ML API'}`}
        action={
          <button className="secondary-btn" onClick={exportRows}>
            <Download size={16} /> Экспорт
          </button>
        }
      />
      <FilterBar className="predictions-filter-bar">
        <label className="search-field">
          <Search size={17} />
          <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Объект, инцидент или ID" aria-label="Поиск прогнозов" />
        </label>
        <select className="select-btn" value={riskFilter} onChange={(event) => { setRiskFilter(event.target.value); setPage(1); }} aria-label="Фильтр по уровню риска">
          <option value="all">Все уровни риска</option><option>Критический</option><option>Высокий</option><option>Средний</option><option>Низкий</option>
        </select>
        <select className="select-btn" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Сортировка прогнозов">
          <option value="risk">Сначала высокий риск-скор</option><option value="probability-asc">Сначала низкий риск-скор</option><option value="name">По названию объекта</option>
        </select>
        <span className="filter-result-count">Найдено: {visiblePredictions.length}</span>
      </FilterBar>
      <div className="panel table-panel">
        <PredictionTable
          rows={pageRows}
          onRow={(id) => go('predictions', id)}
        />
        <div className="pagination">
          <span>Страница {page} из {pageCount} · показано {pageRows.length} из {visiblePredictions.length}</span>
          <div>
            <button aria-label="Предыдущая страница" disabled={page === 1} onClick={() => changePage(page - 1)}>
              Назад
            </button>
            {Array.from({ length: pageCount }, (_, index) => index + 1).slice(Math.max(0, page - 2), Math.max(3, page + 1)).map((x) => (
              <button
                key={x}
                className={page === x ? 'active' : ''}
                onClick={() => changePage(x)}
              >
                {x}
              </button>
            ))}
            <button aria-label="Следующая страница" disabled={page === pageCount} onClick={() => changePage(page + 1)}>
              Вперёд
            </button>
          </div>
        </div>
      </div>
    </>
  );
}


export function PredictionTable({
  rows,
  onRow,
}: {
  rows: PredictionRecord[];
  onRow: (id: string) => void;
}) {
  if (rows.length === 0) {
    return <DataTable empty={<EmptyState title="Прогнозы не найдены" description="Измените поисковый запрос или сбросьте фильтры." />} />;
  }
  return (
    <DataTable>
      <table>
        <thead>
          <tr>
            <th>Объект</th>
            <th>Инцидент</th>
            <th>Оценка риска</th>
            <th>Риск</th>
            <th>Горизонт</th>
            <th scope="col" aria-label="Открыть прогноз" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              tabIndex={0}
              role="button"
              aria-label={`Открыть прогноз: ${p.object}, ${p.type}`}
              onClick={() => onRow(p.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRow(p.id);
                }
              }}
            >
              <td>
                <strong>{p.object}</strong>
                <small>
                  {p.id} · {p.district}
                </small>
              </td>
              <td>{p.type}</td>
              <td aria-label={`${riskScoreLabel(p)} ${p.probability}%`}>
                <div className="prob">
                  <span>
                    <i
                      style={{ width: `${p.probability}%` }}
                      className={`bar-${p.risk.toLowerCase()}`}
                    />
                  </span>
                  <strong>{p.probability}%</strong>
                </div>
              </td>
              <td>
                <span className={riskClass(p.risk)}>
                  <i />
                  {p.risk}
                </span>
              </td>
              <td>
                <strong>{p.horizon}</strong>
                <small>{p.time}</small>
              </td>
              <td>
                <ChevronRight size={17} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataTable>
  );
}



export function PredictionDetail({
  id,
  go,
  notify,
  dispatcher,
  livePredictions,
  liveContexts,
}: {
  id: string;
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
  dispatcher: UserAccount;
  livePredictions: PredictionRecord[];
  liveContexts: MlPredictionFeed['contexts'];
}) {
  const [decision, setDecision] = useState('');
  const [reasonCategory, setReasonCategory] = useState('');
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const [sensor, setSensor] = useState<'temp' | 'vibration' | 'pressure'>(
    'temp',
  );
  const [menu, setMenu] = useState(false);
  const [claimedBy, setClaimedBy] = useState('');
  const [createdRequestId, setCreatedRequestId] = useState<string | null>(null);
  const foundPrediction = livePredictions.find((x) => x.id === id) || predictions.find((x) => x.id === id);
  const p = foundPrediction || predictions[0];
  const linkedMapObject = mapObjects.find((object) => object.predictionId === p.id);
  const baseContext = predictionContexts[p.id] || defaultPredictionContext;
  const context = liveContexts[p.id] || (linkedMapObject ? {
    ...baseContext,
    objectId: linkedMapObject.id,
    system: linkedMapObject.system,
    picket: `ПК ${linkedMapObject.picketFrom}`,
  } : baseContext);
  const objectMetadata = mapObjects.find((object) => object.id === context.objectId);
  const isLivePrediction = Boolean(liveContexts[p.id]);
  const relatedEquipment = equipment.find((item) => item.object === p.object || p.object.includes(item.object) || item.object.includes(p.object));
  const usesDetailedDemoRecommendation = p.id === 'PR-2491';
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        `moscollector-decision-${p.id}`,
      );
      if (!stored) return;
      const savedDecision = JSON.parse(stored) as {
        decision: string;
        comment: string;
        reasonCategory?: string;
      };
      setDecision(savedDecision.decision);
      setReason(savedDecision.comment);
      setReasonCategory(savedDecision.reasonCategory || 'Другое');
      setSaved(true);
    } catch {
      // Keep the prediction available if browser storage is disabled.
    }
  }, [p.id]);
  useEffect(() => {
    try {
      setClaimedBy(window.localStorage.getItem(`moscollector-claim-${p.id}`) || '');
      setCreatedRequestId(loadSentRequests().find((request) => request.sourcePredictionId === p.id)?.requestId || null);
    } catch {
      setClaimedBy('');
    }
  }, [p.id]);
  const claimPrediction = () => {
    try { window.localStorage.setItem(`moscollector-claim-${p.id}`, dispatcher.name); } catch { /* demo session remains usable */ }
    setClaimedBy(dispatcher.name);
    notify(`Прогноз ${p.id} принят в работу`);
  };
  const readOnly = Boolean(claimedBy && claimedBy !== dispatcher.name);
  const sensorConfig = {
    temp: {
      label: 'Температура',
      current: '87 °C',
      change: '+9 °C',
      threshold: '80 °C',
      color: '#DC2626',
    },
    vibration: {
      label: 'Вибрация',
      current: '5,6 мм/с',
      change: '+1,5 мм/с',
      threshold: '4,5 мм/с',
      color: '#EA580C',
    },
    pressure: {
      label: 'Давление',
      current: '3,7 бар',
      change: '−0,4 бар',
      threshold: '4,0 бар',
      color: '#D97706',
    },
  }[sensor];
  const save = () => {
    if (readOnly) {
      notify(`Прогноз уже обрабатывает ${claimedBy}`);
      return;
    }
    if (!decision) {
      notify('Выберите решение диспетчера');
      return;
    }
    if (!reasonCategory) {
      notify('Выберите основание решения');
      return;
    }
    const dispatcherComment = reason.trim();
    if (decision === 'Ложное срабатывание' && !dispatcherComment) {
      notify('Укажите комментарий для ложного срабатывания');
      return;
    }
    try {
      window.localStorage.setItem(
        `moscollector-decision-${p.id}`,
        JSON.stringify({
          decision,
          comment: dispatcherComment,
          reasonCategory,
          savedAt: new Date().toISOString(),
          dispatcher: dispatcher.name,
        }),
      );
    } catch {
      // The decision remains visible for the current session.
    }
    storeJournalEntry({
      predictionId: p.id,
      date: new Date().toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      object: p.object,
      type: p.type,
      probability: `${p.probability}%`,
      fact: journalFact(decision),
      decision,
      dispatcher: dispatcher.name,
      comment: `${reasonCategory}${dispatcherComment ? ` · ${dispatcherComment}` : ''}`,
      status: journalStatus(decision),
    });
    if (decision === 'Направить бригаду') {
      const sentRequests = loadSentRequests();
      const existingRequest = sentRequests.find(
        (request) => request.sourcePredictionId === p.id,
      );
      if (existingRequest) {
        storeSentRequests(
          sentRequests.map((request) =>
            request.requestId === existingRequest.requestId
              ? { ...request, dispatcherComment }
              : request,
          ),
        );
        setSaved(true);
        setCreatedRequestId(existingRequest.requestId);
        notify(`Комментарий в заявке ${existingRequest.requestId} обновлён`);
        return;
      }

      const request: SentRequest = {
        id: p.id,
        sourcePredictionId: p.id,
        risk: p.risk,
        probability: p.probability,
        object: p.object,
        title: `Выезд бригады: ${p.type}`,
        deadline: `В течение ${p.horizon}`,
        requestId: `RQ-${Date.now().toString().slice(-6)}`,
        sentAt: 'Только что',
        status: 'Принята',
        dispatcherComment,
        assignedUnit: 'Аварийно-ремонтная бригада',
        statusHistory: [{ status: 'Принята', at: 'Только что', author: dispatcher.name }],
      };
      storeSentRequests([request, ...sentRequests]);
      setSaved(true);
      setCreatedRequestId(request.requestId);
      notify(`Бригада направлена. Заявка ${request.requestId} принята`);
      return;
    }

    setSaved(true);
    notify('Решение сохранено в журнале');
  };
  if (!foundPrediction) return <EmptyState title="Прогноз не найден" description={`Запись ${id} отсутствует в активной ленте ML API и демонстрационном наборе.`} action={<button className="secondary-btn" onClick={() => go('predictions')}>Все прогнозы</button>} />;
  return (
    <>
      <button className="back-btn" onClick={() => go('predictions')}>
        <ArrowLeft size={17} /> Все прогнозы
      </button>
      <div className="detail-head">
        <div>
          <div className="detail-kicker">
            <span className={riskClass(p.risk)}>
              <i />
              {p.risk} риск
            </span>
            <span>{p.id}</span>
          </div>
          <h2>{p.type}</h2>
          <p>{p.object} · {objectMetadata?.address || (isLivePrediction ? 'Адрес не передан ML API' : 'Адрес не указан в демо-срезе')}</p>
          <div className="prediction-meta">
            <span>{context.objectId}</span><span>{context.system}</span><span>{context.picket}</span><span>Горизонт {p.horizon}</span>
          </div>
        </div>
        <div className="action-menu-wrap">
          {claimedBy ? (readOnly ? (
            <span className="claim-badge locked"><ShieldCheck size={15} />Обрабатывает {claimedBy}</span>
          ) : (
            <button className="claim-badge" onClick={() => {
              try { window.localStorage.removeItem(`moscollector-claim-${p.id}`); } catch { /* keep current session usable */ }
              setClaimedBy('');
              notify(`Прогноз ${p.id} освобождён`);
            }}><ShieldCheck size={15} />Вы обрабатываете · освободить</button>
          )) : (
            <button className="secondary-btn" onClick={claimPrediction}><Users size={16} />Принять в работу</button>
          )}
          <button
            className="icon-btn"
            onClick={() => setMenu(!menu)}
            aria-label="Действия с прогнозом"
          >
            <MoreHorizontal size={20} />
          </button>
          {menu && (
            <div className="action-menu">
              <button
                onClick={() => {
                  downloadFile(
                    `${p.id}.txt`,
                    `${p.id}\n${p.object}\n${p.type}\n${riskScoreLabel(p)}: ${p.probability}%`,
                  );
                  setMenu(false);
                  notify('Карточка прогноза выгружена');
                }}
              >
                <Download size={15} />
                Скачать карточку
              </button>
              <button onClick={() => relatedEquipment ? go('equipment', relatedEquipment.id) : notify('Связь прогноза с карточкой оборудования не передана')}>
                <Factory size={15} />
                Открыть оборудование
              </button>
            </div>
          )}
        </div>
      </div>
      {isLivePrediction && (
        <aside className="model-target-note" aria-label="Ограничения результата модели">
          <ShieldCheck size={18} />
          <div><strong>{riskScoreLabel(p)} · не подтверждение инцидента</strong><p>{p.targetNote || 'Это модельная оценка целевого сигнала. Она не является подтверждением происшествия и требует независимой проверки.'}</p></div>
          {p.autoIncidentConfirmation === false && <StatusBadge tone="info">Инцидент автоматически не подтверждается</StatusBadge>}
        </aside>
      )}
      <div className="prediction-summary-grid" aria-label="Ключевые параметры прогноза">
        <div className="prediction-summary-card primary"><span>Вероятность риска</span><strong>{p.probability}<small>%</small></strong><RiskBadge risk={p.risk} /></div>
        <div className="prediction-summary-card"><span>Горизонт прогноза</span><strong>{p.horizon}</strong><small>Период оценки модели</small></div>
        <div className="prediction-summary-card"><span>Модель</span><strong>{context.modelVersion}</strong><small>{isLivePrediction ? 'Результат ML API' : 'Демонстрационный расчёт'}</small></div>
        <div className="prediction-summary-card"><span>Обновлено</span><strong>{p.time}</strong><small>{p.id}</small></div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel sensor-panel">
            <PanelHead
              title="Показания датчиков"
              subtitle={isLivePrediction ? 'Временной ряд не передан ML API' : 'Демонстрационный ряд за последние 12 часов'}
            />
            {isLivePrediction ? <EmptyState title="Нет телеметрического ряда для этого прогноза" description="API передал факторы и связанные сигналы. Для графика нужны отдельные временные ряды телеметрии; демонстрационные показания здесь не подмешиваются." /> : <>
            <div className="sensor-tabs">
              {(
                [
                  ['temp', 'Температура'],
                  ['vibration', 'Вибрация'],
                  ['pressure', 'Давление'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={sensor === key ? 'active' : ''}
                  onClick={() => setSensor(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="sensor-summary">
              <div>
                <Thermometer size={19} />
                <span>
                  Текущее значение<strong>{sensorConfig.current}</strong>
                </span>
              </div>
              <div>
                <TrendingUp size={19} />
                <span>
                  Изменение за 2 ч
                  <strong style={{ color: sensorConfig.color }}>
                    {sensorConfig.change}
                  </strong>
                </span>
              </div>
              <div>
                <Gauge size={19} />
                <span>
                  Порог тревоги<strong>{sensorConfig.threshold}</strong>
                </span>
              </div>
            </div>
            <div className="sensor-chart">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 260 }}>
                <AreaChart data={sensorData}>
                  <defs>
                    <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0"
                        stopColor={sensorConfig.color}
                        stopOpacity={0.18}
                      />
                      <stop
                        offset="1"
                        stopColor={sensorConfig.color}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eeedf3" />
                  <XAxis dataKey="t" axisLine={false} tickLine={false} />
                  <YAxis
                    domain={['auto', 'auto']}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey={sensor}
                    stroke={sensorConfig.color}
                    strokeWidth={2.5}
                    fill="url(#tempFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            </>}
          </section>
          <section className="panel explain-panel">
            <PanelHead title="Почему сформирован прогноз" subtitle="Факторы показаны для проверки диспетчером" />
            <div className="explain-summary">
              <div><span>{riskScoreLabel(p)}</span><strong>{p.probability}%</strong></div>
              <div><span>Источники</span><strong>{context.sources.join(' · ')}</strong></div>
              <div><span>Расчёт</span><strong>{context.modelVersion}</strong></div>
            </div>
            <div className="factor-list">
              {context.factors.map((factor) => (
                <div className="factor-row" key={factor.label}>
                  <div className="factor-copy"><strong>{factor.label}</strong><small>{factor.note}</small></div>
                  <span>{factor.value}</span>
                  <div className="factor-impact"><i style={{ width: `${factor.impact}%` }} /><b>{factor.impact}%</b></div>
                </div>
              ))}
            </div>
            <div className="historical-note"><ShieldCheck size={18} /><span><strong>Историческое сопоставление</strong>{context.historicalMatch}</span></div>
          </section>
          <section className="panel signal-chain-panel">
            <PanelHead title="Связанные сигналы" subtitle="Один прогноз объединяет последовательность событий" />
            <div className="signal-chain">
              {context.relatedSignals.map((signal, index) => (
                <div key={`${signal.channel}-${signal.time}`}>
                  <span className="signal-order">{index + 1}</span>
                  <span><strong>{signal.event}</strong><small>{signal.time} · {signal.channel}</small></span>
                  <b>{signal.state}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="panel" id="decision-panel">
            <PanelHead
              title="Решение диспетчера"
              subtitle="Выберите действие и укажите основание"
            />
            <div className="decision-grid">
              {([
                ['Направить бригаду', Send],
                ['Продолжить мониторинг', Activity],
                ['Ложное срабатывание', X],
                ['Передать ответственному', Users],
                ['Закрыть после проверки', Check],
              ] as Array<[string, LucideIcon]>).map(([x, I]) => (
                <button
                  key={x}
                  disabled={readOnly}
                  className={decision === x ? 'active' : ''}
                  onClick={() => {
                    setDecision(x);
                    setSaved(false);
                  }}
                >
                  <I size={18} />
                  <span>{x}</span>
                  {decision === x && <Check size={16} />}
                </button>
              ))}
            </div>
            <select
              disabled={readOnly}
              className="decision-reason-select"
              value={reasonCategory}
              onChange={(event) => { setReasonCategory(event.target.value); setSaved(false); }}
              aria-label="Основание решения"
            >
              <option value="">Выберите основание решения</option>
              <option>Подтверждено связанными датчиками</option>
              <option>Требуется визуальная проверка</option>
              <option>Проверено по камере</option>
              <option>Неисправность датчика или линии</option>
              <option>Плановые работы на объекте</option>
              <option>Другое</option>
            </select>
            <textarea
              disabled={readOnly}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setSaved(false);
              }}
              placeholder="Основание решения (обязательно при ложном срабатывании)"
            />
            <div className="decision-footer">
              <p>
                <ShieldCheck size={17} /> Рекомендация сформирована системой.
                Окончательное решение принимает диспетчер.
              </p>
              <button className="primary-btn" onClick={save} disabled={readOnly}>
                {saved ? (
                  <>
                    <Check size={16} /> Сохранено
                  </>
                ) : (
                  <>Сохранить решение</>
                )}
              </button>
            </div>
            {saved && (
              <div className="saved-decision">
                <span>Сохранённое решение</span>
                <strong>{decision}</strong>
                <p>
                  <b>Комментарий диспетчера:</b>{' '}
                  {reason.trim() || 'Комментарий не указан'}
                </p>
                <p><b>Основание:</b> {reasonCategory}</p>
                {createdRequestId && <button className="secondary-btn" onClick={() => go('maintenance', createdRequestId)}>Открыть заявку {createdRequestId} <ChevronRight size={16} /></button>}
              </div>
            )}
          </section>
        </div>
        <aside className="detail-side">
          <section className="panel recommendation">
            <span className="rec-icon">
              <Sparkles size={20} />
            </span>
            <p className="eyebrow">Рекомендация системы</p>
            <h3>{isLivePrediction ? 'Проверить первичные сигналы' : usesDetailedDemoRecommendation ? 'Направить аварийную бригаду' : 'Сверить сигналы объекта'}</h3>
            {isLivePrediction ? <p>Сверьте факторы модели с телеметрией объекта, оцените последствия и укажите основание. Автоматическое предписание и параметры оборудования не переданы API.</p> : usesDetailedDemoRecommendation ? <>
              <p>Демонстрационный пример: провести диагностику подшипникового узла насоса №3 и подготовить резервный агрегат к переключению.</p>
              <ul><li>Снизить нагрузку до 70%</li><li>Проверить систему смазки</li><li>Контролировать каждые 15 минут</li></ul>
            </> : <p>Демонстрационный сценарий: сверить датчики, оценить тенденцию и зафиксировать диспетчерское решение с основанием.</p>}
            <button className="primary-btn full" onClick={() => { setDecision('Направить бригаду'); setReasonCategory('Требуется визуальная проверка'); setSaved(false); document.getElementById('decision-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>Подготовить заявку <ChevronRight size={16} /></button>
          </section>
          <section className="panel object-brief">
            <PanelHead title="Объект" />
            <div className="object-symbol">
              <Factory size={23} />
            </div>
            <h3>{p.object}</h3>
            <p>{context.objectId} · {relatedEquipment?.type || context.system}</p>
            {isLivePrediction || !relatedEquipment ? <p className="demo-caption">{isLivePrediction ? 'Сервис оборудования не передал карточку и историю обслуживания для этого объекта.' : 'Связанная карточка оборудования не указана в демо-срезе.'}</p> : <dl>
              <div>
                <dt>Последнее ТО</dt>
                <dd>{relatedEquipment.last}</dd>
              </div>
              <div>
                <dt>Следующее ТО</dt>
                <dd>{relatedEquipment.next}</dd>
              </div>
              <div>
                <dt>Состояние</dt>
                <dd>{relatedEquipment.state}</dd>
              </div>
            </dl>}
            <button
              className="secondary-btn full"
              disabled={!relatedEquipment}
              onClick={() => relatedEquipment ? go('equipment', relatedEquipment.id) : notify('Связь прогноза с карточкой оборудования не передана')}
            >
              {relatedEquipment ? 'Карточка оборудования' : 'Оборудование не связано'}
            </button>
            <button className="secondary-btn full" disabled={!linkedMapObject} onClick={() => linkedMapObject && go('map', linkedMapObject.id)}><Map size={16} /> {linkedMapObject ? 'Показать на карте' : 'Координаты объекта не переданы'}</button>
          </section>
        </aside>
      </div>
    </>
  );
}
