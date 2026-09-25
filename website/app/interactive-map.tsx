'use client';

export type MapPoint = [number, number];

export type MapObject = {
  id: string;
  predictionId?: string;
  name: string;
  address: string;
  district: string;
  system: string;
  incident: string;
  risk: 'critical' | 'high' | 'medium' | 'low';
  probability: number;
  position: [number, number];
  geometry: MapPoint[];
  picketFrom: number;
  picketTo: number;
  sensors: number;
  onlineSensors: number;
  connection: 'Онлайн' | 'Нестабильно' | 'Нет связи';
};

const riskLabels: Record<MapObject['risk'], string> = {
  critical: 'Критический',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

function pathFrom(points: MapPoint[]) {
  return points.map(([x, y], index) => `${index ? 'L' : 'M'} ${x} ${y}`).join(' ');
}

export default function InteractiveMap({
  objects,
  selectedId,
  onSelect,
}: {
  objects: MapObject[];
  center?: [number, number];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const selected = objects.find((object) => object.id === selectedId) || objects[0];

  return (
    <div className="collector-scheme" aria-label="Схема инженерных коллекторов с пикетами">
      <div className="scheme-toolbar">
        <div className="scheme-heading">
          <strong>Топология сети</strong>
          <span>Условная схема коллекторов и узлов</span>
        </div>
        <div className="scheme-status">
          <span><i className="scheme-live" /> Схема объектов</span>
          <b>1 пикет = 10 м</b>
        </div>
      </div>

      <div className="scheme-stage">
        <svg viewBox="0 0 920 540" className="collector-svg" role="img">
          <title>Интерактивная топология инженерных коллекторов</title>
          <defs>
            <pattern id="scheme-grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M 32 0 L 0 0 0 32" fill="none" className="scheme-grid-line" />
            </pattern>
            <linearGradient id="scheme-surface" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" className="scheme-surface-start" />
              <stop offset="1" className="scheme-surface-end" />
            </linearGradient>
            <filter id="selected-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect width="920" height="540" fill="url(#scheme-surface)" rx="22" />
          <rect width="920" height="540" fill="url(#scheme-grid)" rx="22" />

          <g className="scheme-zones" aria-hidden="true">
            <rect x="38" y="55" width="350" height="175" rx="42" />
            <rect x="405" y="44" width="468" height="236" rx="54" />
            <rect x="44" y="278" width="418" height="220" rx="54" />
            <rect x="478" y="302" width="396" height="190" rx="48" />
            <text x="66" y="84">ЮЖНЫЙ КОНТУР</text>
            <text x="790" y="74">СЕВЕРНЫЙ КОНТУР</text>
            <text x="70" y="472">ЗАПАДНЫЙ КОНТУР</text>
            <text x="744" y="470">ВОСТОЧНЫЙ КОНТУР</text>
          </g>

          <path className="scheme-water" d="M-30 432 C150 365 298 500 486 426 C640 365 770 421 958 346" />
          <text x="724" y="421" className="scheme-water-label">водоотводящий контур</text>

          {objects.map((object) => {
            const path = pathFrom(object.geometry);
            const midpoint = object.geometry[Math.floor(object.geometry.length / 2)];
            const start = object.geometry[0];
            const end = object.geometry[object.geometry.length - 1];
            const sensorPoints = object.geometry.slice(1, -1);
            const isSelected = selected?.id === object.id;

            return (
              <g
                key={object.id}
                className={`collector-line risk-${object.risk} ${isSelected ? 'selected' : ''}`}
                onClick={() => onSelect(object.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelect(object.id);
                }}
                role="button"
                tabIndex={0}
                aria-label={`${object.name}, ${riskLabels[object.risk]} риск`}
              >
                <title>{object.name} · {object.system} · риск {object.probability}%</title>
                <path className="collector-line-hit" d={path} />
                <path className="collector-line-track" d={path} />
                <path className="collector-line-risk" d={path} filter={isSelected ? 'url(#selected-glow)' : undefined} />

                <circle className="collector-terminal-ring" cx={start[0]} cy={start[1]} r="10" />
                <circle className="collector-terminal" cx={start[0]} cy={start[1]} r="5" />
                <circle className="collector-terminal-ring" cx={end[0]} cy={end[1]} r="10" />
                <circle className="collector-terminal" cx={end[0]} cy={end[1]} r="5" />

                {sensorPoints.map(([x, y], index) => (
                  <g key={`${object.id}-${index}`}>
                    <circle className="sensor-halo" cx={x} cy={y} r={isSelected ? 11 : 9} />
                    <circle className="collector-sensor" cx={x} cy={y} r={isSelected ? 5 : 4} />
                    {isSelected && (
                      <text x={x} y={y - 15} className="picket-label">
                        ПК {object.picketFrom + (index + 1) * 10}
                      </text>
                    )}
                  </g>
                ))}

                <g className={`collector-label ${isSelected ? 'selected' : ''}`}>
                  <rect x={midpoint[0] - 45} y={midpoint[1] + 17} width="90" height="26" rx="13" />
                  <circle cx={midpoint[0] - 31} cy={midpoint[1] + 30} r="3" />
                  <text x={midpoint[0] + 5} y={midpoint[1] + 34}>{object.id}</text>
                </g>
              </g>
            );
          })}

          <g className="scheme-intersection">
            <circle className="intersection-halo" cx="452" cy="286" r="27" />
            <circle cx="452" cy="286" r="16" />
            <text x="452" y="291">У</text>
          </g>
          <text x="477" y="278" className="intersection-label">узел сопряжения</text>
        </svg>

        {selected && (
          <div className="scheme-selection" aria-live="polite">
            <div className="scheme-selection-top">
              <span className={`scheme-risk risk-${selected.risk}`}><i />{riskLabels[selected.risk]}</span>
              <b>{selected.probability}%</b>
            </div>
            <strong>{selected.name}</strong>
            <p>{selected.system} · ПК {selected.picketFrom}—{selected.picketTo}</p>
            <div>
              <span><small>Датчики</small><b>{selected.onlineSensors}/{selected.sensors}</b></span>
              <span><small>Связь</small><b>{selected.connection}</b></span>
            </div>
          </div>
        )}
      </div>

      <div className="scheme-footer">
        <div className="scheme-risk-legend">
          {(['critical', 'high', 'medium', 'low'] as const).map((risk) => (
            <span key={risk} className={`scheme-risk risk-${risk}`}>
              <i />{riskLabels[risk]} · {objects.filter((object) => object.risk === risk).length}
            </span>
          ))}
        </div>
        <span><i className="sensor-symbol" /> датчик</span>
        <span><b className="junction-symbol">У</b> узел сопряжения</span>
        <span className="demo-badge">Топология объектов</span>
      </div>
    </div>
  );
}
