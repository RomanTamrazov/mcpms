'use client';
import { useEffect, useState } from 'react';
import { Check, ChevronRight, Clock3, Factory, Send } from 'lucide-react';
import { UserAccount, maintenanceJobs, SentRequest, ArchivedRequest, initialSentRequests, loadSentRequests, storeSentRequests, loadArchivedRequests, storeArchivedRequests, journalStorageKey, loadJournalEntries, riskClass } from './moscollector-core';
import { PageHead, PanelHead } from './moscollector-layout';


export function Maintenance({ notify, user, openRequestId, onSwitchRole }: { notify: (s: string) => void; user: UserAccount; openRequestId?: string | null; onSwitchRole: (next?: 'analytics') => void }) {
  const [sent, setSent] = useState<SentRequest[]>(initialSentRequests);
  const [archived, setArchived] = useState<ArchivedRequest[]>([]);
  const [responseDrafts, setResponseDrafts] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [openedRequest, setOpenedRequest] = useState<string | null>(null);
  const isTechnician = user.role === 'technician';
  useEffect(() => {
    try {
      setSent(loadSentRequests());
      setArchived(loadArchivedRequests());
    } catch {
      // The default list remains available if browser storage is disabled.
    }
  }, []);
  useEffect(() => setOpenedRequest(openRequestId || null), [openRequestId]);
  useEffect(() => {
    if (!openRequestId) return;
    const timer = window.setTimeout(() => document.getElementById(`request-${openRequestId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    return () => window.clearTimeout(timer);
  }, [openRequestId, sent, archived]);
  const sentRecommendationIds = new Set(
    [...sent, ...archived].map((item) => item.id),
  );
  const proposals = isTechnician ? [] : maintenanceJobs.filter(
    (job) => !sentRecommendationIds.has(job.id),
  );
  const sendRequest = (job: (typeof maintenanceJobs)[number]) => {
    const nextSent: SentRequest[] = [
      {
        ...job,
        requestId: `RQ-${1086 + sent.length + 1}`,
        sentAt: 'Только что',
        status: 'Отправлена',
        assignedUnit: 'Эксплуатационное подразделение',
        statusHistory: [{ status: 'Отправлена', at: 'Только что', author: user.name }],
      },
      ...sent,
    ];
    setSent(nextSent);
    storeSentRequests(nextSent);
    notify(`Заявка по объекту «${job.object}» отправлена`);
  };
  const updateRequestStatus = (requestId: string, status: string) => {
    const at = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const next = sent.map((request) => request.requestId === requestId ? {
      ...request,
      status,
      statusHistory: [...(request.statusHistory || []), { status, at, author: user.name }],
    } : request);
    setSent(next);
    storeSentRequests(next);
    notify(`Статус заявки ${requestId}: ${status}`);
  };

  const closeRequest = (request: SentRequest, status: 'Выполнена' | 'Отклонена') => {
    const response = (responseDrafts[request.requestId] || '').trim();
    if (!response) {
      notify('Сначала напишите ответ по заявке');
      return;
    }

    const archivedAt = new Date().toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    const closedRequest: ArchivedRequest = {
      ...request,
      status,
      result: response,
      technicianResponse: response,
      closedBy: user.name,
      archivedAt,
      statusHistory: [
        ...(request.statusHistory || []),
        { status, at: archivedAt, author: user.name },
      ],
    };
    const nextSent = sent.filter((item) => item.requestId !== request.requestId);
    const nextArchived = [closedRequest, ...archived];
    setSent(nextSent);
    setArchived(nextArchived);
    setOpenedRequest(null);
    setResponseDrafts((current) => {
      const next = { ...current };
      delete next[request.requestId];
      return next;
    });
    storeSentRequests(nextSent);
    storeArchivedRequests(nextArchived);

    if (request.sourcePredictionId) {
      const entries = loadJournalEntries();
      const nextEntries = entries.map((entry) =>
        entry.predictionId === request.sourcePredictionId
          ? {
              ...entry,
              fact: status === 'Выполнена' ? 'Подтверждён' : 'Не подтверждён',
              status: 'Закрыт',
              comment: `${entry.comment} · Ответ техника: ${response}`,
            }
          : entry,
      );
      try {
        window.localStorage.setItem(journalStorageKey, JSON.stringify(nextEntries));
      } catch {
        // The archived request still contains the technician response.
      }
    }

    notify(`Заявка ${request.requestId} ${status.toLowerCase()} и перенесена в архив`);
  };
  return (
    <>
      <PageHead
        title="Заявки"
        subtitle="Рекомендации системы и контроль исполнения"
        action={isTechnician ? <button className="secondary-btn" onClick={() => onSwitchRole('analytics')}>Сменить роль</button> : undefined}
      />
      <div className={`maintenance-board${isTechnician ? ' technician-board' : ''}`}>
        {!isTechnician && (
        <section className="maintenance-column">
          <div className="column-head">
            <div>
              <h3>Предлагаемые заявки</h3>
              <p>Сформированы на основе прогнозов</p>
            </div>
            <span className="request-count"><strong>{proposals.length}</strong><small>предлагаемых</small></span>
          </div>
          <div className="maintenance-cards">
            {proposals.map((job) => (
              <article className="job-card" key={job.id}>
                <div className="job-top">
                  <span className={riskClass(job.risk)}>
                    <i />
                    {job.risk}
                  </span>
                  <span className="risk-percent">
                    Риск <strong>{job.probability}%</strong>
                  </span>
                </div>
                <span className="object-id">{job.id}</span>
                <h3>{job.title}</h3>
                <p>
                  <Factory size={15} />
                  {job.object}
                </p>
                <p>
                  <Clock3 size={15} />
                  {job.deadline}
                </p>
                {expanded === job.id && (
                  <div className="job-details">
                    Рекомендуется провести внеплановый осмотр, зафиксировать
                    показания и проверить резервное оборудование.
                  </div>
                )}
                <div>
                  <button
                    className="secondary-btn"
                    onClick={() =>
                      setExpanded(expanded === job.id ? null : job.id)
                    }
                  >
                    {expanded === job.id ? 'Скрыть' : 'Подробнее'}
                  </button>
                  <button
                    className="primary-btn"
                    onClick={() => sendRequest(job)}
                  >
                    <Send size={16} />
                    Отправить заявку
                  </button>
                </div>
              </article>
            ))}
            {proposals.length === 0 && (
              <div className="column-empty">
                <Check size={22} />
                <strong>Все рекомендации обработаны</strong>
                <span>Новых предлагаемых заявок нет</span>
              </div>
            )}
          </div>
        </section>
        )}
        <section className="maintenance-column">
          <div className="column-head">
            <div>
              <h3>{isTechnician ? 'Назначенные заявки' : 'Принятые заявки'}</h3>
              <p>{isTechnician ? 'Ожидают ответа техника' : 'Переданы эксплуатационным подразделениям'}</p>
            </div>
            <span className="request-count"><strong>{sent.length}</strong><small>{isTechnician ? 'назначенных' : 'принятых'}</small></span>
          </div>
          <div className="maintenance-cards">
            {sent.map((job) => (
              <article className="job-card" id={`request-${job.requestId}`} key={job.requestId}>
                <div className="job-top">
                  <span className={riskClass(job.risk)}>
                    <i />
                    {job.risk}
                  </span>
                  <span className="risk-percent">
                    Риск <strong>{job.probability}%</strong>
                  </span>
                </div>
                <span className="object-id">{job.requestId}</span>
                <h3>{job.title}</h3>
                <p>
                  <Factory size={15} />
                  {job.object}
                </p>
                <p>
                  <Clock3 size={15} />
                  Отправлена: {job.sentAt}
                </p>
                <div className="sent-meta">
                  <span>Статус заявки</span>
                  <strong>{job.status}</strong>
                </div>
                {openedRequest === job.requestId && (
                  <div className="request-details">
                    <div>
                      <span>Номер заявки</span>
                      <strong>{job.requestId}</strong>
                    </div>
                    <div>
                      <span>Срок выполнения</span>
                      <strong>{job.deadline}</strong>
                    </div>
                    <div>
                      <span>Источник</span>
                      <strong>
                        {job.sourcePredictionId
                          ? `Прогноз ${job.sourcePredictionId}`
                          : `Рекомендация ${job.id}`}
                      </strong>
                    </div>
                    <div>
                      <span>Подразделение</span>
                      <strong>{job.assignedUnit}</strong>
                    </div>
                    <div className="request-comment">
                      <span>Комментарий диспетчера</span>
                      <strong>
                        {job.dispatcherComment || 'Комментарий не указан'}
                      </strong>
                    </div>
                    {job.result && (
                      <div className="request-comment">
                        <span>Результат работ</span>
                        <strong>{job.result}</strong>
                      </div>
                    )}
                    <div className="request-history">
                      <span>История статусов</span>
                      {(job.statusHistory || []).map((event, index) => (
                        <p key={`${event.status}-${index}`}><i /> <strong>{event.status}</strong><small>{event.at} · {event.author}</small></p>
                      ))}
                    </div>
                    {isTechnician && (
                      <div className="technician-response">
                        <label htmlFor={`response-${job.requestId}`}>Ответ по заявке</label>
                        <textarea
                          id={`response-${job.requestId}`}
                          value={responseDrafts[job.requestId] || ''}
                          onChange={(event) => setResponseDrafts((current) => ({
                            ...current,
                            [job.requestId]: event.target.value,
                          }))}
                          placeholder="Опишите выполненные работы или причину отклонения"
                          rows={3}
                        />
                        <div className="technician-actions">
                          {job.status !== 'В работе' && (
                            <button
                              className="secondary-btn"
                              onClick={() => updateRequestStatus(job.requestId, 'В работе')}
                            >
                              Принять в работу
                            </button>
                          )}
                          <button
                            className="primary-btn"
                            onClick={() => closeRequest(job, 'Выполнена')}
                          >
                            Выполнено
                          </button>
                          <button
                            className="secondary-btn reject-btn"
                            onClick={() => closeRequest(job, 'Отклонена')}
                          >
                            Отклонить
                          </button>
                        </div>
                      </div>
                    )}
                    {!isTechnician && <div className="demo-role-hint"><strong>Изменение статуса — задача технического специалиста</strong><p>Для обработки заявки войдите в роли «Технический персонал». Заявка сохранится в этом браузере.</p><button className="secondary-btn" onClick={() => onSwitchRole()}>Сменить роль</button></div>}
                  </div>
                )}
                <div>
                  <button
                    className="secondary-btn full"
                    aria-expanded={openedRequest === job.requestId}
                    onClick={() => {
                      const next =
                        openedRequest === job.requestId ? null : job.requestId;
                      setOpenedRequest(next);
                      if (next) notify(`Открыта заявка ${job.requestId}`);
                    }}
                  >
                    {openedRequest === job.requestId
                      ? 'Скрыть детали'
                      : 'Открыть заявку'}
                    <ChevronRight
                      className={
                        openedRequest === job.requestId ? 'chevron-open' : ''
                      }
                      size={15}
                    />
                  </button>
                </div>
              </article>
            ))}
            {sent.length === 0 && (
              <div className="column-empty">
                <Check size={22} />
                <strong>Активных заявок нет</strong>
                <span>Все назначенные заявки обработаны</span>
              </div>
            )}
          </div>
        </section>
      </div>
      <section className="panel request-archive">
        <PanelHead
          title="Архив заявок"
          subtitle={isTechnician ? 'Ваши завершённые ответы' : 'Ответы эксплуатационных подразделений'}
        />
        <div className="archive-list">
          {archived
            .filter((request) => !isTechnician || request.closedBy === user.name)
            .map((request) => (
              <article className="archive-row" id={`request-${request.requestId}`} key={`${request.requestId}-${request.archivedAt}`}>
                <div>
                  <span className="object-id">{request.requestId}</span>
                  <strong>{request.title}</strong>
                  <small>{request.object}</small>
                </div>
                <div className="archive-response">
                  <span>Ответ техника</span>
                  <p>{request.technicianResponse}</p>
                </div>
                <div className="archive-meta">
                  <strong className={request.status === 'Выполнена' ? 'archive-success' : 'archive-rejected'}>
                    {request.status}
                  </strong>
                  <small>{request.archivedAt} · {request.closedBy}</small>
                </div>
              </article>
            ))}
          {archived.filter((request) => !isTechnician || request.closedBy === user.name).length === 0 && (
            <div className="column-empty compact">
              <strong>Архив пока пуст</strong>
              <span>Завершённые заявки появятся здесь</span>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
