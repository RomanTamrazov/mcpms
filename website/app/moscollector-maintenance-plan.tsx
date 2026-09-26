'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, ClipboardList, Info, Wrench } from 'lucide-react';
import { PageHead } from './moscollector-layout';
import { equipmentPlanSummary, maintenanceByMonth, pprSchedule } from './maintenance-plan-data';

type PlanTab = 'ppr' | 'to';

const months = ['Все', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const show = (value: string | null) => value || 'Не указано';

export function MaintenancePlan() {
  const [tab, setTab] = useState<PlanTab>('ppr');
  const [month, setMonth] = useState('Все');
  const visiblePpr = useMemo(() => pprSchedule.filter((item) => month === 'Все' || item.month === month), [month]);
  const totalSensors = visiblePpr.reduce((sum, item) => sum + item.sensors, 0);
  const totalEvents = maintenanceByMonth.reduce((sum, item) => sum + item.to + item.toTr + item.tr, 0);
  const maxSeriesValue = Math.max(...maintenanceByMonth.flatMap((item) => [item.to, item.toTr, item.tr]));
  const barHeight = (value: number) => value === 0 ? '0%' : `${Math.max(5, value / maxSeriesValue * 100)}%`;

  return (
    <>
      <PageHead title="Графики ППР и ТО" subtitle="Плановые работы АКМ и ДУ на 2026 год" />
      <section className="plan-source-note" role="note">
        <Info size={18} />
        <p><strong>Плановые данные.</strong> Это не факт выполнения работ и не ML-признак: исходные графики не содержат <code>ид_объект</code> или <code>ид_канала_данных</code>. Сопоставление с телеметрией появится только после получения официального справочника соответствий.</p>
      </section>
      <div className="plan-tabs" role="tablist" aria-label="Тип графика">
        <button type="button" role="tab" aria-selected={tab === 'ppr'} className={tab === 'ppr' ? 'active' : ''} onClick={() => setTab('ppr')}><CalendarDays size={16} />ППР датчиков метана</button>
        <button type="button" role="tab" aria-selected={tab === 'to'} className={tab === 'to' ? 'active' : ''} onClick={() => setTab('to')}><Wrench size={16} />ТО и ТР АКМ / ДУ</button>
      </div>
      {tab === 'ppr' ? (
        <>
          <div className="plan-metrics">
            <article><span>Объекты в фильтре</span><strong>{visiblePpr.length}</strong><small>из 26 строк ППР</small></article>
            <article><span>Датчики метана</span><strong>{totalSensors.toLocaleString('ru-RU')}</strong><small>планово охвачены ППР</small></article>
            <article><span>Полные интервалы</span><strong>{visiblePpr.filter((item) => item.demount && item.removal && item.acceptance).length}</strong><small>демонтаж → вывоз → приёмка</small></article>
          </div>
          <div className="plan-filter"><label htmlFor="ppr-month">Месяц проведения ППР</label><select id="ppr-month" value={month} onChange={(event) => setMonth(event.target.value)}>{months.map((item) => <option value={item} key={item}>{item}</option>)}</select>{month !== 'Все' && <button type="button" className="secondary-btn" onClick={() => setMonth('Все')}>Сбросить фильтр</button>}</div>
          <section className="panel plan-table-panel">
            <header className="panel-head"><div><h3>План-график ППР аппаратуры контроля метана</h3><p>Источник: «График ППР АКМ на 2026 г. РЭК»</p></div><span className="plan-badge">План 2026</span></header>
            <div className="table-scroll"><table className="plan-table"><thead><tr><th>Коллектор</th><th>Месяц</th><th>Датчики</th><th>Демонтаж</th><th>Передача на ППР</th><th>Вывоз</th><th>Приёмка</th></tr></thead><tbody>{visiblePpr.map((item) => <tr key={item.object}><td><strong>{item.object}</strong><small>Не сопоставлен с ML-объектом</small></td><td>{item.month}</td><td>{item.sensors}</td><td>{show(item.demount)}</td><td>{show(item.delivery)}</td><td>{show(item.removal)}</td><td>{show(item.acceptance)}</td></tr>)}</tbody></table></div>
          </section>
        </>
      ) : (
        <>
          <div className="plan-metrics">
            <article><span>Плановых операций</span><strong>{totalEvents}</strong><small>ТО, ТО+ТР и ТР</small></article>
            <article><span>ТО + ТР</span><strong>138</strong><small>комбинированных операций</small></article>
            <article><span>Позиций оборудования</span><strong>140</strong><small>в исходном графике</small></article>
          </div>
          <section className="panel plan-table-panel">
            <header className="panel-head"><div><h3>Нагрузка плановых работ по месяцам</h3><p>Источник: «График ТО и ТР систем АКМ и ДУ на 2026 г.»</p></div><span className="plan-badge">Помесячно</span></header>
            <div className="maintenance-chart-scroll">
              <div className="maintenance-chart" aria-label="Количество запланированных операций по месяцам">{maintenanceByMonth.map((item) => { const total = item.to + item.toTr + item.tr; return <article key={item.month} aria-label={`${item.month}: ТО ${item.to}, ТО плюс ТР ${item.toTr}, ТР ${item.tr}, всего ${total}`}><div className="maintenance-chart-bars"><span><b>{item.to}</b><i className="to" style={{ height: barHeight(item.to) }} /><small>ТО</small></span><span><b>{item.toTr}</b><i className="to-tr" style={{ height: barHeight(item.toTr) }} /><small>ТО+ТР</small></span><span><b>{item.tr}</b><i className="tr" style={{ height: barHeight(item.tr) }} /><small>ТР</small></span></div><strong>{item.month}</strong><span>Всего {total}</span></article>; })}</div>
            </div>
            <div className="plan-legend"><span><i className="to" />ТО</span><span><i className="to-tr" />ТО+ТР</span><span><i className="tr" />ТР</span></div>
          </section>
          <section className="panel plan-table-panel">
            <header className="panel-head"><div><h3>Оборудование в графике ТО</h3><p>Все 140 строк оборудования; это не количество единиц</p></div><ClipboardList size={19} /></header>
            <div className="table-scroll"><table className="plan-table"><thead><tr><th>Тип оборудования</th><th>Позиций в графике</th></tr></thead><tbody>{equipmentPlanSummary.map((item) => <tr key={item.equipment}><td><strong>{item.equipment}</strong></td><td>{item.positions}</td></tr>)}</tbody></table></div>
          </section>
        </>
      )}
    </>
  );
}
