'use client';
import { useEffect, useState } from 'react';
import { type Section } from '@/lib/app-routes';
import { Activity, AlertTriangle, ChevronRight, Map, RefreshCcw, ShieldCheck, Siren, TrendingDown, Wrench } from 'lucide-react';
import { EmptyState, ErrorState, LoadingSkeleton, ObjectPreview, RiskBadge, SectionCard, StatusBadge } from '@/components/ui/enterprise';
import { type MlHealth } from '@/lib/ml-api';
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { UserAccount, roleLabels, PredictionRecord, MlConnectionState, JournalEntry, loadJournalEntries, mapObjects, trend, connectionLabel, riskScoreLabel } from './moscollector-core';
import { PageHead, Metric, PanelHead } from './moscollector-layout';
import { PredictionTable } from './moscollector-predictions';
import type { MapObject } from './interactive-map';


export function Dashboard({
  go,
  notify,
  user,
  activePredictions,
  usingDemoFeed,
  mlConnection,
  mlHealth,
  mlFeedError,
  lastMlSync,
  refreshInterval,
  onRefresh,
}: {
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
  user: UserAccount;
  activePredictions: PredictionRecord[];
  usingDemoFeed: boolean;
  mlConnection: MlConnectionState;
  mlHealth: MlHealth | null;
  mlFeedError: string;
  lastMlSync: string;
  refreshInterval: string;
  onRefresh: () => void;
}) {
  const [shiftDate, setShiftDate] = useState('—');
  const [recentJournal, setRecentJournal] = useState<JournalEntry[]>([]);
  useEffect(() => {
    setShiftDate(
      new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Moscow',
      }).format(new Date()),
    );
  }, []);
  useEffect(() => setRecentJournal(loadJournalEntries()), []);
  const dashboardPredictions = activePredictions.filter((prediction) => user.district === 'Все округа' || prediction.district === user.district);
  const criticalCount = dashboardPredictions.filter((prediction) => prediction.risk === 'Критический').length;
  const highCount = dashboardPredictions.filter((prediction) => prediction.risk === 'Высокий').length;
  const readyModels = mlHealth?.models.filter((model) => model.status === 'ready').length ?? 0;
  const visibleObjects = mapObjects.filter((object) => user.district === 'Все округа' || object.district === user.district);
  const sensorCount = visibleObjects.reduce((sum, object) => sum + object.sensors, 0);
  const onlineSensorCount = visibleObjects.reduce((sum, object) => sum + object.onlineSensors, 0);
  const eventItems = recentJournal.slice(0, 3);
  const recommendedPrediction = [...dashboardPredictions].sort((a, b) => b.probability - a.probability)[0];
  const criticalObject = visibleObjects.find((object) => object.predictionId === recommendedPrediction?.id);
  return (
    <>
      <PageHead
        title="Ситуационный центр"
        subtitle={`${shiftDate} · ${roleLabels[user.role]} ${user.name} · ${user.district}`}
        action={
          <button
            className="secondary-btn"
            onClick={() => { onRefresh(); notify('Запрошено обновление статуса ML API'); }}
          >
            <RefreshCcw size={16} /> Обновить
          </button>
        }
      />
      {mlFeedError && <ErrorState title="Лента прогнозов не обновилась" description={mlFeedError} />}
      <div className="metric-grid four dashboard-kpis">
        <Metric icon={TrendingDown} label="Объекты на схеме" value={String(visibleObjects.length)} note="Демонстрационная топология" tone="purple" trend="под наблюдением" />
        <Metric icon={AlertTriangle} label="Критический риск" value={String(criticalCount)} note="Требует решения" tone="red" trend={usingDemoFeed ? 'демо-срез' : 'ML API'} />
        <Metric icon={Siren} label="Высокий риск" value={String(highCount)} note="Активных прогнозов" tone="orange" trend={usingDemoFeed ? 'демо-срез' : 'ML API'} />
        <Metric icon={ShieldCheck} label="Датчики онлайн" value={sensorCount ? `${Math.round(onlineSensorCount / sensorCount * 100)}%` : '—'} note={`${onlineSensorCount} из ${sensorCount} на схеме`} tone="green" trend="демо-топология" />
      </div>
      <div className="dashboard-feature-grid">
        <section className="panel critical-intelligence" aria-label="Приоритетный прогноз">
          <div className="critical-intelligence-top"><span className="eyebrow"><i className="critical-live-dot" /> Приоритет смены</span><span className="critical-source">{usingDemoFeed ? 'Демонстрационный прогноз' : 'ML API'}</span></div>
          {recommendedPrediction ? <>
            <div className="critical-intelligence-score"><span className="critical-score-value">{recommendedPrediction.probability}<small>%</small></span><RiskBadge risk={recommendedPrediction.risk} /></div>
            <h3>{recommendedPrediction.object}</h3>
            <p className="critical-intelligence-lead">{recommendedPrediction.type}</p>
            <div className="critical-intelligence-meta"><span>Горизонт <strong>{recommendedPrediction.horizon}</strong></span><span>Объект <strong>{criticalObject?.id || 'не связан со схемой'}</strong></span></div>
            <div className="critical-intelligence-actions"><button className="primary-btn" onClick={() => go('predictions', recommendedPrediction.id)}>Открыть прогноз <ChevronRight size={16} /></button><button className="secondary-btn" onClick={() => go(criticalObject ? 'map' : 'maintenance', criticalObject?.id)}>{criticalObject ? 'На карте' : 'Открыть заявки'}</button></div>
          </> : <EmptyState title="Активных прогнозов нет" description="После получения нового сигнала приоритетный объект появится здесь." />}
          <div className="critical-intelligence-foot"><Activity size={15} /> Решение требует проверки диспетчером; оценка модели не подтверждает инцидент.</div>
        </section>
        <section className="panel map-mini">
          <PanelHead title="Объекты на схеме" subtitle={`Топология сети · ${visibleObjects.length} объектов`} link="Открыть карту" onClick={() => go('map')} />
          <MiniMap objects={visibleObjects} selectedId={criticalObject?.id} onSelect={(id) => go('map', id)} onMap={() => go('map')} />
        </section>
      </div>
      <div className="dashboard-insights-grid">
        <section className="panel risk-panel">
          <PanelHead title="Объекты высокого риска" subtitle="Отсортированы по вероятности" link="Все прогнозы" onClick={() => go('predictions')} />
          <div className="risk-list">
            {[...dashboardPredictions].sort((a, b) => b.probability - a.probability).slice(0, 4).map((p, i) => (
              <button key={p.id} className="risk-row" onClick={() => go('predictions', p.id)}>
                <span className={`risk-rank r${i + 1}`}>{i + 1}</span><span className="risk-main"><strong>{p.object}</strong><small>{p.type}</small></span>
                <span className="risk-prob"><strong>{p.probability}%</strong><small>{p.horizon}</small></span><RiskBadge risk={p.risk} /><ChevronRight size={17} />
              </button>
            ))}
            {dashboardPredictions.length === 0 && <EmptyState title="Нет объектов высокого риска" description="Активные прогнозы появятся после обновления ленты." />}
          </div>
        </section>
        <div className={`system-overview ${mlConnection}`}>
        <div className="system-overview-main">
          <span className="system-overview-icon"><Activity size={19} /></span>
          <div>
            <span className="eyebrow">Состояние контура прогнозирования</span>
            <h3>{connectionLabel(mlConnection)}</h3>
            <p>Проверка {lastMlSync} · {refreshInterval === 'manual' ? 'обновление вручную' : `обновление ленты каждые ${refreshInterval === '0.5' ? '30 секунд' : `${refreshInterval} мин`}`}</p>
          </div>
          <StatusBadge tone={usingDemoFeed ? 'info' : 'success'}>
            {usingDemoFeed ? 'Демонстрационный набор' : 'Данные из ML API'}
          </StatusBadge>
        </div>
        <div className="system-overview-models">
          <div className="system-overview-section-title"><strong>Реестр моделей</strong><span>{mlHealth ? `${readyModels} из ${mlHealth.models.length} готовы` : mlConnection === 'loading' ? 'Проверка…' : 'нет соединения'}</span></div>
          {mlConnection === 'loading' ? <LoadingSkeleton rows={2} /> : mlHealth?.models.length ? (
            <div className="model-status-grid">
              {mlHealth.models.map((model) => (
                <div key={model.id} className="model-status-item">
                  <i className={model.status === 'ready' ? 'ready' : model.status === 'error' ? 'failed' : 'waiting'} />
                  <span><strong title={model.display_name}>{model.display_name}</strong><small>{model.status === 'ready' ? 'Готова к запросам' : model.status === 'not_configured' ? 'Пакет не настроен' : model.status === 'error' ? 'Ошибка загрузки' : 'Ограниченный режим'}</small></span>
                </div>
              ))}
            </div>
          ) : <EmptyState title={mlConnection === 'unconfigured' ? 'Демо-режим' : 'Реестр моделей недоступен'} description={mlConnection === 'unconfigured' ? 'Показываем прозрачный демонстрационный срез. Реальные результаты появятся после подключения API.' : 'Интерфейс сохраняет карточки последнего успешного ответа или демонстрационный срез.'} />}
        </div>
        <div className="system-overview-footer">
          <span>{usingDemoFeed ? 'Данные страницы содержат демонстрационные примеры' : `Реальных активных прогнозов: ${activePredictions.length}`}</span>
          <span>Датчики на схеме: {onlineSensorCount} / {sensorCount} онлайн</span>
        </div>
        </div>
      </div>
      <div className="dashboard-analysis-grid">
        <section className="panel chart-panel">
          <PanelHead
            title="Динамика за 24 часа"
            subtitle="Демонстрационный тренд прогнозов и инцидентов"
            link="Аналитика"
            onClick={() => go('analytics')}
          />
          <div className="legend">
            <span>
              <i className="legend-purple" /> Прогнозы
            </span>
            <span>
              <i className="legend-orange" /> Инциденты
            </span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 240 }}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="predFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6246D9" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#6246D9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eeedf3" />
                <XAxis dataKey="t" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="predictions"
                  stroke="#6246D9"
                  strokeWidth={2.5}
                  fill="url(#predFill)"
                />
                <Line
                  type="monotone"
                  dataKey="incidents"
                  stroke="#EA580C"
                  strokeWidth={2.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel latest-panel">
          <PanelHead
            title="Последние прогнозы"
            link="Смотреть все"
            onClick={() => go('predictions')}
          />
          <PredictionTable rows={dashboardPredictions.slice(0, 4)} onRow={(id) => go('predictions', id)} />
        </section>
      </div>
      <DashboardSupport
        go={go}
        user={user}
        predictions={dashboardPredictions}
        events={eventItems}
        recommendedPrediction={recommendedPrediction}
        usingDemoFeed={usingDemoFeed}
        onlineSensorCount={onlineSensorCount}
        sensorCount={sensorCount}
      />
    </>
  );
}



export function DashboardSupport({
  go,
  user,
  predictions: dashboardPredictions,
  events: eventItems,
  recommendedPrediction,
  usingDemoFeed,
  onlineSensorCount,
  sensorCount,
}: {
  go: (s: Section, id?: string) => void;
  user: UserAccount;
  predictions: PredictionRecord[];
  events: JournalEntry[];
  recommendedPrediction?: PredictionRecord;
  usingDemoFeed: boolean;
  onlineSensorCount: number;
  sensorCount: number;
}) {
  return (
    <div className="dashboard-support-grid">
      <SectionCard title="Последние события" description={usingDemoFeed ? 'Демо-срез активных сигналов' : 'События из подключённого контура'} className="dashboard-events-card">
        <div className="dashboard-event-list">
          {eventItems.length > 0 ? eventItems.map((event) => (
            <div className="dashboard-event" key={event.predictionId}>
              <span className={`event-marker ${event.status === 'В работе' ? 'warning' : 'success'}`} />
              <span><strong>{event.decision} · {event.object}</strong><small>{event.type} · {event.date} · {event.dispatcher}</small></span>
            </div>
          )) : dashboardPredictions.slice(0, 3).map((prediction) => (
            <button className="dashboard-event" key={prediction.id} aria-label={`Открыть прогноз ${prediction.id}: ${prediction.object}, ${prediction.type}`} onClick={() => go('predictions', prediction.id)}>
              <span className={`event-marker ${prediction.risk === 'Критический' ? 'danger' : 'warning'}`} />
              <span><strong>Сформирован прогноз · {prediction.object}</strong><small>{prediction.type} · {prediction.time} · {riskScoreLabel(prediction)} {prediction.probability}%</small></span>
            </button>
          ))}
          {dashboardPredictions.length === 0 && <EmptyState title="Событий пока нет" description="Новые сигналы появятся после обновления ленты." />}
        </div>
      </SectionCard>
      <SectionCard title="Рекомендация системы" description="Решение всегда остаётся за диспетчером" className="dashboard-recommendation-card">
        {recommendedPrediction ? (
          <ObjectPreview title={recommendedPrediction.object} subtitle={`${recommendedPrediction.id} · ${recommendedPrediction.type}`} risk={recommendedPrediction.risk} className="dashboard-object-preview">
            <div className="dashboard-recommendation-body">
              <p>Проверьте связанные телеметрические сигналы и зафиксируйте решение с основанием.</p>
              <div><span>{riskScoreLabel(recommendedPrediction)}<strong>{recommendedPrediction.probability}%</strong></span><span>Горизонт<strong>{recommendedPrediction.horizon}</strong></span></div>
            </div>
            <button className="primary-btn full" onClick={() => go('predictions', recommendedPrediction.id)}>Проверить прогноз <ChevronRight size={16} /></button>
          </ObjectPreview>
        ) : <EmptyState title="Нет активных рекомендаций" description="Система сообщит о следующем значимом отклонении." />}
        <div className="dashboard-quick-actions">
          <button className="secondary-btn" onClick={() => go('map')}><Map size={16} />Карта объектов</button>
          <button className="secondary-btn" onClick={() => go('maintenance')}><Wrench size={16} />Заявки</button>
        </div>
      </SectionCard>
      <SectionCard title="Состояние инфраструктуры" description={`Область мониторинга: ${user.district}`} className="dashboard-infrastructure-card">
        <div className="infrastructure-summary">
          <div><span>Датчики на схеме</span><strong>{onlineSensorCount} <small>/ {sensorCount}</small></strong></div>
          <div className="sensor-availability"><i style={{ width: `${sensorCount ? Math.round(onlineSensorCount / sensorCount * 100) : 0}%` }} /></div>
          <div className="infrastructure-breakdown"><span><i className="source-ok" /> Связь стабильна <strong>{mapObjects.filter((object) => (user.district === 'Все округа' || object.district === user.district) && object.connection === 'Онлайн').length}</strong></span><span><i className="source-wait" /> Требуют проверки <strong>{mapObjects.filter((object) => (user.district === 'Все округа' || object.district === user.district) && object.connection !== 'Онлайн').length}</strong></span></div>
          <small className="demo-caption">Показатели рассчитаны по схеме объектов и не заменяют производственную телеметрию.</small>
        </div>
      </SectionCard>
    </div>
  );
}



export function MiniMap({
  objects,
  selectedId,
  onSelect,
  onMap,
}: {
  objects: MapObject[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onMap: () => void;
}) {
  return (
    <div className="dashboard-network-map">
      <svg viewBox="0 0 920 540" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs><pattern id="dashboard-network-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M 32 0 L 0 0 0 32" /></pattern></defs>
        <rect width="920" height="540" fill="url(#dashboard-network-grid)" />
        <path className="dashboard-network-water" d="M-30 432 C150 365 298 500 486 426 C640 365 770 421 958 346" />
        {objects.map((object) => <path key={object.id} className={`dashboard-network-line risk-${object.risk} ${object.id === selectedId ? 'selected' : ''}`} d={object.geometry.map(([x,y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ')} />)}
      </svg>
      {objects.map((object) => {
        const [x, y] = object.geometry[Math.floor(object.geometry.length / 2)];
        return <MapMarker key={object.id} risk={object.risk} x={`${x / 920 * 100}%`} y={`${y / 540 * 100}%`} label={`${object.name}, риск ${object.probability}%`} selected={object.id === selectedId} onClick={() => onSelect(object.id)} />;
      })}
      <div className="dashboard-map-legend"><span><i className="legend-critical" /> Критический</span><span><i className="legend-high" /> Высокий</span><span><i className="legend-normal" /> Норма</span></div>
      <button className="dashboard-map-open" onClick={onMap}>Исследовать схему <ChevronRight size={15} /></button>
      <div className="map-attribution">Демонстрационная топология · ОДС</div>
    </div>
  );
}


export function MapMarker({
  risk,
  x,
  y,
  label,
  selected,
  onClick,
}: {
  risk: string;
  x: string;
  y: string;
  label?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label || `Объект, риск: ${risk}`}
      className={`map-marker marker-${risk} ${selected ? 'selected' : ''}`}
      style={{ left: x, top: y }}
      onClick={onClick}
    >
      <span />
    </button>
  );
}
