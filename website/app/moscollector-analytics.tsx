'use client';
import { useEffect, useState } from 'react';
import { type Section } from '@/lib/app-routes';
import { Activity, ChevronRight, CircleGauge, Clock3, Download, Sparkles } from 'lucide-react';
import { EmptyState, SectionCard } from '@/components/ui/enterprise';
import { CartesianGrid, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { SentRequest, ArchivedRequest, loadSentRequests, loadArchivedRequests, JournalEntry, loadJournalEntries, analyticsMonths, downloadFile } from './moscollector-core';
import { PageHead, Metric, PanelHead } from './moscollector-layout';


export function Analytics({ notify, go }: { notify: (s: string) => void; go: (s: Section, id?: string) => void }) {
  const [period, setPeriod] = useState('6 месяцев');
  const [sessionJournal, setSessionJournal] = useState<JournalEntry[]>([]);
  const [sessionRequests, setSessionRequests] = useState<SentRequest[]>([]);
  const [sessionArchive, setSessionArchive] = useState<ArchivedRequest[]>([]);
  useEffect(() => {
    setSessionJournal(loadJournalEntries());
    setSessionRequests(loadSentRequests().filter((request) => !['RQ-1087', 'RQ-1086'].includes(request.requestId)));
    setSessionArchive(loadArchivedRequests());
  }, []);
  const latestSessionRequest = sessionArchive[0] || sessionRequests[0];
  const monthsInPeriod = period === '30 дней' ? 1 : period === '3 месяца' ? 3 : 6;
  const periodData = analyticsMonths.slice(-monthsInPeriod);
  const totalForecasts = periodData.reduce((sum, month) => sum + month.forecasts, 0);
  const average = (key: 'precision' | 'recall' | 'reaction') =>
    periodData.reduce((sum, month) => sum + month[key] * month.forecasts, 0) / totalForecasts;
  const precision = average('precision');
  const recall = average('recall');
  const reaction = Math.round(average('reaction'));
  const formatPercent = (value: number) => `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
  const riskData = [
    { name: 'Низкий', value: 61, color: '#16A34A' },
    { name: 'Средний', value: 25, color: '#D97706' },
    { name: 'Высокий', value: 11, color: '#EA580C' },
    { name: 'Критический', value: 3, color: '#DC2626' },
  ];
  return (
    <>
      <PageHead
        title="Аналитика модели"
        subtitle={`Показатели модели · выбранный период: ${period}`}
        action={
          <div className="inline-actions">
            <select
              className="select-btn"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              aria-label="Период аналитики"
            >
              <option>30 дней</option>
              <option>3 месяца</option>
              <option>6 месяцев</option>
            </select>
            <button
              className="secondary-btn"
              onClick={() => {
                downloadFile(
                  'analytics-report.csv',
                  `\uFEFFПоказатель;Значение\nПериод;${period}\nПрогнозы;${totalForecasts}\nPrecision;${formatPercent(precision)}\nRecall;${formatPercent(recall)}\nСреднее время реакции;${reaction} мин`,
                  'text/csv;charset=utf-8',
                );
                notify('Аналитический отчёт выгружен');
              }}
            >
              <Download size={16} /> Отчёт
            </button>
          </div>
        }
      />
      <SectionCard title="Итоги текущей смены" description="Действия, сохранённые в этом браузере" className="demo-outcome-card" action={<button className="secondary-btn" onClick={() => go('incidents')}>Открыть журнал</button>}>
        <div className="demo-outcome-grid"><div><span>Решений в журнале</span><strong>{sessionJournal.length}</strong></div><div><span>Создано заявок</span><strong>{sessionRequests.length + sessionArchive.length}</strong></div><div><span>Завершено / отклонено</span><strong>{sessionArchive.length}</strong></div></div>
        {latestSessionRequest ? <div className="demo-outcome-latest"><span>Последняя заявка</span><strong>{latestSessionRequest.requestId} · {latestSessionRequest.object}</strong><small>Статус: {latestSessionRequest.status}</small><button className="secondary-btn" onClick={() => go('maintenance', latestSessionRequest.requestId)}>Открыть заявку <ChevronRight size={16} /></button></div> : <EmptyState title="Сценарий ещё не начат" description="Откройте критический прогноз и оформите решение диспетчера: результат появится здесь." action={<button className="secondary-btn" onClick={() => go('predictions')}>К прогнозам</button>} />}
      </SectionCard>
      <div className="metric-grid four">
        <Metric
          icon={Sparkles}
          label="Всего прогнозов"
          value={totalForecasts.toLocaleString('ru-RU')}
          note="за выбранный период"
          tone="purple"
          trend="сохранённый срез"
        />
        <Metric
          icon={CircleGauge}
          label="Precision"
          value={formatPercent(precision)}
          note="взвешенное среднее · цель ≥ 88%"
          tone={precision >= 88 ? 'green' : 'yellow'}
          trend="сохранённый срез"
        />
        <Metric
          icon={Activity}
          label="Recall"
          value={formatPercent(recall)}
          note="взвешенное среднее · цель ≥ 84%"
          tone={recall >= 84 ? 'green' : 'yellow'}
          trend="сохранённый срез"
        />
        <Metric
          icon={Clock3}
          label="Среднее время реакции"
          value={`${reaction} мин`}
          note="целевое ≤ 25 мин"
          tone="purple"
          trend="сохранённый срез"
        />
      </div>
      <div className="analytics-grid">
        <section className="panel analytics-wide">
          <PanelHead
            title="Качество прогнозирования"
            subtitle="Precision и Recall по месяцам"
          />
          <div className="legend">
            <span>
              <i className="legend-purple" />
              Precision
            </span>
            <span>
              <i className="legend-orange" />
              Recall
            </span>
          </div>
          <div className="chart-wrap large-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 280 }}>
              <LineChart data={periodData}>
                <CartesianGrid vertical={false} stroke="#eeedf3" />
                <XAxis dataKey="m" axisLine={false} />
                <YAxis domain={[65, 100]} axisLine={false} />
                <Tooltip />
                <Line dataKey="precision" stroke="#6246D9" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line dataKey="recall" stroke="#EA580C" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <PanelHead
            title="Распределение рисков"
            subtitle="Доля прогнозов за выбранный период"
          />
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={210} minWidth={0} initialDimension={{ width: 420, height: 210 }}>
              <PieChart>
                <Pie
                  data={riskData.map((item) => ({ ...item, fill: item.color }))}
                  dataKey="value"
                  innerRadius={62}
                  outerRadius={87}
                  paddingAngle={3}
                />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>{totalForecasts.toLocaleString('ru-RU')}</strong>
              <span>прогноз</span>
            </div>
          </div>
          <div className="risk-legend">
            {riskData.map((x) => (
              <span key={x.name}>
                <i style={{ background: x.color }} />
                {x.name}
                <strong>{x.value}%</strong>
              </span>
            ))}
          </div>
        </section>
        <section className="panel analytics-wide">
          <PanelHead
            title="Эффективность рекомендаций"
            subtitle="Сценарные оценки · не зависят от фильтра периода"
          />
          <div className="efficiency">
            <div>
              <span>Направлена бригада</span>
              <strong>89%</strong>
              <i>
                <b style={{ width: '89%' }} />
              </i>
              <small>сценарная оценка предотвращения</small>
            </div>
            <div>
              <span>Продолжен мониторинг</span>
              <strong>76%</strong>
              <i>
                <b style={{ width: '76%' }} />
              </i>
              <small>сценарная оценка решения</small>
            </div>
            <div>
              <span>Создана заявка</span>
              <strong>93%</strong>
              <i>
                <b style={{ width: '93%' }} />
              </i>
              <small>сценарная оценка срока</small>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
