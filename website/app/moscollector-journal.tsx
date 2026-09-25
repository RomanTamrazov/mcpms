'use client';
import { useEffect, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { JournalEntry, journalStatusClass, loadJournalEntries, downloadFile } from './moscollector-core';
import { PageHead } from './moscollector-layout';

export function Incidents({ notify }: { notify: (s: string) => void }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Все');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  useEffect(() => setJournalEntries(loadJournalEntries()), []);
  const rows = [
    ...journalEntries.map((entry) => [
      entry.date,
      entry.object,
      entry.type,
      entry.probability,
      entry.fact,
      entry.decision,
      entry.dispatcher,
      entry.comment,
      entry.status,
    ]),
    [
      '15.09, 08:42',
      'КНС «Нагатинская»',
      'Перегрев',
      '94%',
      'Ожидается',
      'Бригада',
      'А. Крылова',
      'Проверить насос и подготовить резервный агрегат',
      'В работе',
    ],
    [
      '14.09, 17:21',
      'ТП-184',
      'Падение давления',
      '82%',
      'Подтверждён',
      'Заявка',
      'И. Орлов',
      'Проверить контур давления',
      'Закрыт',
    ],
    [
      '14.09, 12:08',
      'Коллектор К-17',
      'Превышение уровня',
      '71%',
      'Не наступил',
      'Мониторинг',
      'А. Крылова',
      'Контролировать показания каждые 30 минут',
      'Наблюдение',
    ],
    [
      '13.09, 22:14',
      'ВЗУ-7',
      'Вибрация',
      '68%',
      'Не подтверждён',
      'Ложное',
      'М. Савин',
      'Скачок показаний датчика не подтвердился',
      'Закрыт',
    ],
  ];
  const visibleRows = rows.filter(
    (row) =>
      (status === 'Все' || row[8] === status) &&
      row.join(' ').toLowerCase().includes(query.toLowerCase()),
  );
  const exportJournal = () => {
    downloadFile(
      'journal.csv',
      `\uFEFF${rows.map((row) => row.join(';')).join('\n')}`,
      'text/csv;charset=utf-8',
    );
    notify('Журнал выгружен');
  };
  return (
    <>
      <PageHead
        title="Журнал"
        subtitle="Сопоставление прогнозов, фактов и решений диспетчеров"
        action={
          <button className="secondary-btn" onClick={exportJournal}>
            <Download size={16} /> Выгрузить журнал
          </button>
        }
      />
      <div className="panel table-panel">
        <div className="table-tools">
          <label className="search-field">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск по журналу"
            />
          </label>
          <select
            className="select-btn"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Статус записи"
          >
            <option>Все</option>
            <option>В работе</option>
            <option>Закрыт</option>
            <option>Наблюдение</option>
            <option>Передан</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  'Дата',
                  'Объект',
                  'Тип',
                  'Прогноз',
                  'Факт',
                  'Решение',
                  'Диспетчер',
                  'Комментарий диспетчера',
                  'Статус',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>
                      {j === 8 ? (
                        <span
                          className={`status-badge ${journalStatusClass(c)}`}
                        >
                          {c}
                        </span>
                      ) : j === 3 ? (
                        <strong>{c}</strong>
                      ) : j === 7 ? (
                        <span className="journal-comment">{c}</span>
                      ) : (
                        c
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-cell">
                    Записи не найдены
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
