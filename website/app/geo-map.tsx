'use client';

import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
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
    <div className="geo-map" aria-label="Географическая карта демонстрационных объектов Москвы">
      <MapContainer center={[55.75, 37.62]} zoom={11} minZoom={9} maxZoom={16} scrollWheelZoom={false} className="geo-map-leaflet">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
          eventHandlers={{ tileerror: () => setTilesUnavailable(true), tileload: () => setTilesUnavailable(false) }}
        />
        <FollowSelection selected={selected} />
        {objects.map((object) => (
          <CircleMarker
            key={object.id}
            center={object.position}
            radius={object.id === selectedId ? 13 : 9}
            pathOptions={{ color: '#ffffff', weight: object.id === selectedId ? 3 : 2, fillColor: markerColors[object.risk], fillOpacity: 1 }}
            eventHandlers={{ click: () => onSelect(object.id) }}
          >
            <Popup>
              <div className="geo-popup">
                <strong>{object.name}</strong>
                <span>{object.system} · {riskNames[object.risk]} риск</span>
                <span>Демо-оценка риска {object.probability}%</span>
                <div>
                  {object.predictionId && <button type="button" onClick={() => onPrediction(object.predictionId!)}>Прогноз</button>}
                  <button type="button" onClick={() => onRequest(object.id)}>Заявка</button>
                </div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      <div className="geo-map-data-note">Точки размещены по условным координатам Москвы</div>
      {tilesUnavailable && <div className="geo-map-offline" role="status">Картографическая подложка недоступна. Маркеры и карточки объектов продолжают работать.</div>}
    </div>
  );
}
