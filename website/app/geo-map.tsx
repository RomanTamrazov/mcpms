'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import type { CircleMarker as LeafletCircleMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapObject } from './interactive-map';

const markerColors: Record<MapObject['risk'], string> = {
  critical: '#dc3545',
  high: '#ef7d32',
  medium: '#d19b1b',
  low: '#2b9561',
};

const riskNames: Record<MapObject['risk'], string> = {
  critical: 'Критический',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

function FollowSelection({ selected }: { selected?: MapObject }) {
  const map = useMap();
  useEffect(() => {
    if (selected) map.panTo(selected.position, { animate: true });
  }, [map, selected]);
  return null;
}

function MapZoomShortcuts() {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();
    const changeZoom = (direction: 1 | -1) => {
      if (direction > 0) map.zoomIn();
      else map.zoomOut();
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      changeZoom(event.deltaY < 0 ? 1 : -1);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !['+', '=', '-', '_'].includes(event.key)) return;
      event.preventDefault();
      changeZoom(event.key === '+' || event.key === '=' ? 1 : -1);
    };

    container.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      container.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [map]);

  return null;
}

function ObjectMarker({
  object,
  selected,
  onSelect,
  onPrediction,
  onRequest,
}: {
  object: MapObject;
  selected: boolean;
  onSelect: (id: string) => void;
  onPrediction: (id: string) => void;
  onRequest: (id: string) => void;
}) {
  const marker = useRef<LeafletCircleMarker | null>(null);

  useEffect(() => {
    if (selected) marker.current?.openPopup();
    else marker.current?.closePopup();
  }, [selected]);

  return (
    <CircleMarker
      ref={marker}
      center={object.position}
      radius={selected ? 13 : 9}
      pathOptions={{ color: '#ffffff', weight: selected ? 3 : 2, fillColor: markerColors[object.risk], fillOpacity: 1 }}
      eventHandlers={{ click: () => onSelect(object.id) }}
    >
      <Popup autoClose closeOnClick>
        <div className="geo-popup">
          <strong>{object.name}</strong>
          <span>{object.system} · {riskNames[object.risk]} риск</span>
          <span>Оценка риска {object.probability}%</span>
          <div>
            {object.predictionId && <button type="button" onClick={() => onPrediction(object.predictionId!)}>Прогноз</button>}
            <button type="button" onClick={() => onRequest(object.id)}>Заявка</button>
          </div>
        </div>
      </Popup>
    </CircleMarker>
  );
}

export default function GeoMap({
  objects,
  selectedId,
  onSelect,
  onPrediction,
  onRequest,
}: {
  objects: MapObject[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onPrediction: (id: string) => void;
  onRequest: (id: string) => void;
}) {
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const selected = objects.find((object) => object.id === selectedId);

  return (
    <div className="geo-map" aria-label="Географическая карта объектов Москвы">
      <MapContainer center={[55.75, 37.62]} zoom={11} minZoom={9} maxZoom={16} scrollWheelZoom={false} className="geo-map-leaflet">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          eventHandlers={{ tileerror: () => setTilesUnavailable(true), tileload: () => setTilesUnavailable(false) }}
        />
        <FollowSelection selected={selected} />
        <MapZoomShortcuts />
        {objects.map((object) => (
          <ObjectMarker
            key={object.id}
            object={object}
            selected={object.id === selectedId}
            onSelect={onSelect}
            onPrediction={onPrediction}
            onRequest={onRequest}
          />
        ))}
      </MapContainer>
      <div className="geo-map-data-note">Точки размещены по условным координатам Москвы</div>
      <div className="geo-map-controls-hint">Масштаб: Ctrl + колесо или Ctrl + / Ctrl −</div>
      {tilesUnavailable && <div className="geo-map-offline" role="status">Картографическая подложка недоступна. Маркеры и карточки объектов продолжают работать.</div>}
    </div>
  );
}
