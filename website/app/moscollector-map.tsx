'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import type { MapObject } from './interactive-map';
import { type Section } from '@/lib/app-routes';
import { AlertTriangle, ChevronRight, Download, RefreshCcw, Search, Wrench } from 'lucide-react';
import { EmptyState, FilterBar, ObjectPreview, RiskBadge } from '@/components/ui/enterprise';
import { Risk, UserAccount, predictions, SentRequest, loadSentRequests, storeSentRequests, storeJournalEntry, equipment, mapObjects, downloadFile } from './moscollector-core';
import { PageHead } from './moscollector-layout';


export const GeoMap = dynamic(() => import('./geo-map'), { ssr: false });



export function MapPage({
  go,
  notify,
  user,
  selectedObjectId,
}: {
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
  user: UserAccount;
  selectedObjectId?: string | null;
}) {
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState('all');
  const [district, setDistrict] = useState('all');
  const [incident, setIncident] = useState('all');
  const [system, setSystem] = useState('all');
  const [selectedId, setSelectedId] = useState(selectedObjectId || 'OBJ-101');
  useEffect(() => {
    if (selectedObjectId) setSelectedId(selectedObjectId);
  }, [selectedObjectId]);
  const filtered = useMemo(
    () =>
      mapObjects.filter(
        (object) =>
          (user.district === 'Все округа' || object.district === user.district) &&
          (risk === 'all' || object.risk === risk) &&
          (district === 'all' || object.district === district) &&
          (incident === 'all' || object.incident === incident) &&
          (system === 'all' || object.system === system) &&
          `${object.name} ${object.address} ${object.id} ${object.system}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [district, incident, query, risk, system, user.district],
  );
  const selected = filtered.find((object) => object.id === selectedId) || filtered[0];
  const riskLabels: Record<MapObject['risk'], Risk> = {
    critical: 'Критический',
    high: 'Высокий',
    medium: 'Средний',
    low: 'Низкий',
  };
  const exportGeoJson = () => {
    const geojson = {
      type: 'FeatureCollection',
      features: filtered.map((object) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [object.position[1], object.position[0]] },
        properties: {
          id: object.id,
          name: object.name,
          system: object.system,
          picket_from: object.picketFrom,
          picket_to: object.picketTo,
          risk: object.risk,
          probability: object.probability,
          coordinate_source: 'demo_moscow',
        },
      })),
    };
    downloadFile(
      'moscollector-objects.geojson',
      JSON.stringify(geojson, null, 2),
      'application/geo+json',
    );
    notify('GeoJSON с условными координатами выгружен');
  };
  const resetFilters = () => {
    setQuery('');
    setRisk('all');
    setDistrict('all');
    setIncident('all');
    setSystem('all');
    notify('Фильтры сброшены');
  };
  const openOrCreateRequest = (objectId: string) => {
    const object = mapObjects.find((item) => item.id === objectId);
    if (!object) return;
    const existing = loadSentRequests().find((item) => item.id === object.id || (object.predictionId && item.sourcePredictionId === object.predictionId));
    if (existing) {
      go('maintenance', existing.requestId);
      return;
    }
    const prediction = predictions.find((item) => item.id === object.predictionId);
    const at = new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const request: SentRequest = {
      id: object.id,
      sourcePredictionId: object.predictionId,
      risk: riskLabels[object.risk],
      probability: object.probability,
      object: prediction?.object || object.name,
      title: `Проверка объекта: ${object.incident}`,
      deadline: 'В течение текущей смены',
      requestId: `RQ-${Date.now().toString().slice(-6)}`,
      sentAt: at,
      status: 'Отправлена',
      assignedUnit: 'Эксплуатационное подразделение',
      dispatcherComment: 'Заявка создана из карты объектов',
      statusHistory: [{ status: 'Отправлена', at, author: user.name }],
    };
    storeSentRequests([request, ...loadSentRequests()]);
    if (prediction) storeJournalEntry({
      predictionId: prediction.id,
      date: at,
      object: prediction.object,
      type: prediction.type,
      probability: `${prediction.probability}%`,
      fact: 'Ожидается',
      decision: 'Заявка',
      dispatcher: user.name,
      comment: 'Создана заявка из карты объектов',
      status: 'В работе',
    });
    notify(`Заявка ${request.requestId} создана в браузере`);
    go('maintenance', request.requestId);
  };
  return (
    <>
      <PageHead
        title="Карта инженерных объектов"
        subtitle="Географическая карта с условными координатами инженерных объектов"
        action={
          <div className="inline-actions">
            <button className="secondary-btn" onClick={exportGeoJson}>
              <Download size={16} /> GeoJSON
            </button>
            <button className="secondary-btn" onClick={resetFilters}>
              <RefreshCcw size={16} /> Сбросить вид
            </button>
          </div>
        }
      />
      <div className="map-operational-summary" aria-label="Сводка объектов на карте">
        <span><strong>{filtered.length}</strong> в текущем виде</span>
        <span className="map-summary-critical"><i /> <strong>{filtered.filter((object) => object.risk === 'critical').length}</strong> критический риск</span>
        <span className="map-summary-high"><i /> <strong>{filtered.filter((object) => object.risk === 'high').length}</strong> высокий риск</span>
        <span><strong>{filtered.filter((object) => object.connection === 'Онлайн').length}</strong> на связи</span>
      </div>
      <FilterBar>
        <label className="search-field">
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Объект, адрес или ID"
          />
        </label>
        <select
          className="select-btn"
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          aria-label="Инженерная система"
        >
          <option value="all">Все инженерные системы</option>
          {[...new Set(mapObjects.map((x) => x.system))].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          className="select-btn"
          value={incident}
          onChange={(e) => setIncident(e.target.value)}
          aria-label="Тип инцидента"
        >
          <option value="all">Все типы инцидентов</option>
          {[...new Set(mapObjects.map((x) => x.incident))].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <select
          className="select-btn"
          value={risk}
          onChange={(e) => setRisk(e.target.value)}
          aria-label="Уровень риска"
        >
          <option value="all">Все риски</option>
          <option value="critical">Критический</option>
          <option value="high">Высокий</option>
          <option value="medium">Средний</option>
          <option value="low">Низкий</option>
        </select>
        <select
          className="select-btn"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
          aria-label="Округ"
        >
          <option value="all">Все округа</option>
          {[...new Set(mapObjects.map((x) => x.district))].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </FilterBar>
      <div className="map-layout">
        <div className="real-map-wrap">
          <GeoMap objects={filtered} selectedId={selected?.id} onSelect={setSelectedId} onPrediction={(id) => go('predictions', id)} onRequest={openOrCreateRequest} />
          {filtered.length > 0 && <div className="geo-object-picker"><label htmlFor="geo-object-select">Выбранный объект</label><select id="geo-object-select" value={selected?.id || ''} onChange={(event) => setSelectedId(event.target.value)}>{filtered.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</select></div>}
          {filtered.length === 0 && (
            <div className="map-empty">
              <EmptyState title="Объекты не найдены" description="Измените критерии фильтра или сбросьте поиск." />
            </div>
          )}
        </div>
        {selected ? <aside className="object-card">
          <div className="object-image">
            <span>Выбранный объект</span>
            <RiskBadge risk={riskLabels[selected.risk]} />
          </div>
          <div className="object-card-body">
            <ObjectPreview title={selected.name} subtitle={`${selected.id} · ${selected.district}`} risk={riskLabels[selected.risk]} className="map-object-preview">
              <p>{selected.address}</p>
              <p className="object-system">{selected.system} · ПК {selected.picketFrom}—{selected.picketTo}</p>
            </ObjectPreview>
            <div className="map-inspector-risk"><div><span>Оценка риска</span><strong>{selected.probability}<small>%</small></strong></div><p>{selected.incident}</p></div>
            <div className="object-stats">
              <div>
                <span>Связь</span>
                <strong>{selected.connection}</strong>
              </div>
              <div>
                <span>Датчики</span>
                <strong>{selected.onlineSensors} из {selected.sensors}</strong>
              </div>
            </div>
            <div className="object-alert">
              <AlertTriangle size={17} />
              <span>
                <strong>Требуется проверка сигнала</strong>
                <small>Оценка требует проверки диспетчером; событие не подтверждено.</small>
              </span>
            </div>
            <p className="object-equipment-type">Оборудование: {equipment.find((item) => item.object === predictions.find((prediction) => prediction.id === selected.predictionId)?.object)?.type || 'тип не передан в реестре'}</p>
            <button
              className="primary-btn full"
              disabled={!selected.predictionId}
              onClick={() => selected.predictionId && go('predictions', selected.predictionId)}
            >
              {selected.predictionId ? 'Открыть прогноз' : 'Активного прогноза нет'} <ChevronRight size={16} />
            </button>
            <button className="secondary-btn full" onClick={() => openOrCreateRequest(selected.id)}><Wrench size={16} /> Создать / открыть заявку</button>
          </div>
        </aside> : <aside className="object-card"><EmptyState title="Объект не выбран" description="Измените фильтры, чтобы увидеть карточку объекта." /></aside>}
      </div>
    </>
  );
}
