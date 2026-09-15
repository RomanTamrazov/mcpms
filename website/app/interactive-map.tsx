'use client';

import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';

export type MapObject = {
  id: string;
  name: string;
  address: string;
  district: string;
  incident: string;
  risk: 'critical' | 'high' | 'medium' | 'low';
  probability: number;
  position: [number, number];
};

function ViewController({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, 12, { duration: 0.8 });
  }, [center, map]);
  return null;
}

export default function InteractiveMap({
  objects,
  center,
  onSelect,
}: {
  objects: MapObject[];
  center: [number, number];
  onSelect: (id: string) => void;
}) {
  const icons = useMemo(
    () => ({
      critical: L.divIcon({
        className: '',
        html: '<span class="leaflet-risk-marker critical"><i></i></span>',
        iconSize: [30, 36],
        iconAnchor: [15, 34],
      }),
      high: L.divIcon({
        className: '',
        html: '<span class="leaflet-risk-marker high"><i></i></span>',
        iconSize: [30, 36],
        iconAnchor: [15, 34],
      }),
      medium: L.divIcon({
        className: '',
        html: '<span class="leaflet-risk-marker medium"><i></i></span>',
        iconSize: [30, 36],
        iconAnchor: [15, 34],
      }),
      low: L.divIcon({
        className: '',
        html: '<span class="leaflet-risk-marker low"><i></i></span>',
        iconSize: [30, 36],
        iconAnchor: [15, 34],
      }),
    }),
    [],
  );

  return (
    <MapContainer
      center={[55.751244, 37.618423]}
      zoom={10}
      scrollWheelZoom
      className="leaflet-map"
      zoomControl
    >
      <ViewController center={center} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {objects.map((object) => (
        <Marker
          key={object.id}
          position={object.position}
          icon={icons[object.risk]}
          eventHandlers={{ click: () => onSelect(object.id) }}
        >
          <Popup>
            <strong>{object.name}</strong>
            <br />
            {object.incident}
            <br />
            Вероятность: {object.probability}%
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
