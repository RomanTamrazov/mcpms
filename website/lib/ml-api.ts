export type UiRisk = 'Критический' | 'Высокий' | 'Средний' | 'Низкий';

export type UiPrediction = {
  id: string;
  object: string;
  district: string;
  type: string;
  probability: number;
  risk: UiRisk;
  horizon: string;
  time: string;
  status: string;
  scoreKind?: string;
  targetNote?: string;
  autoIncidentConfirmation?: boolean;
};

export type UiPredictionContext = {
  system: string;
  objectId: string;
  picket: string;
  modelVersion: string;
  sources: string[];
  factors: { label: string; value: string; impact: number; note: string }[];
  relatedSignals: { time: string; channel: string; event: string; state: string }[];
  historicalMatch: string;
};

type ApiPrediction = {
  id: string;
  object_id: string;
  object_name: string;
  district: string;
  system: string;
  picket: string;
  incident_type: string;
  probability: number;
  risk: 'critical' | 'high' | 'medium' | 'low';
  horizon_hours: number;
  created_at: string;
  model_version: string;
  sources?: string[];
  factors?: { label: string; value: string; impact: number; note?: string }[];
  related_signals?: {
    timestamp: string;
    channel_id: string | number;
    event: string;
    state: string;
  }[];
  historical_match?: string;
  score_kind?: string;
  target_note?: string;
  auto_incident_confirmation?: boolean;
  risk_alert?: boolean;
};

export type MlPredictionFeed = {
  items: UiPrediction[];
  contexts: Record<string, UiPredictionContext>;
};

export type MlModelStatus = {
  id: string;
  display_name: string;
  status: string;
  serving_ready?: boolean;
  error?: string | null;
  horizon_hours?: number;
};

export type MlHealth = {
  status: string;
  models: MlModelStatus[];
};

const riskLabels: Record<ApiPrediction['risk'], UiRisk> = {
  critical: 'Критический',
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

function apiBaseUrl() {
  const configured = import.meta.env.VITE_ML_API_URL?.replace(/\/$/, '');
  if (configured) return configured;
  if (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    return 'http://localhost:8000';
  }
  return '';
}

export function hasMlApiUrl() {
  return Boolean(apiBaseUrl());
}

export async function fetchMlHealth(signal?: AbortSignal): Promise<MlHealth | null> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) return null;
  const response = await fetch(`${baseUrl}/health`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`ML API returned ${response.status}`);
  const body = (await response.json()) as Partial<MlHealth>;
  return {
    status: typeof body.status === 'string' ? body.status : 'degraded',
    models: Array.isArray(body.models) ? body.models : [],
  };
}

function horizonLabel(hours: number) {
  if (hours >= 48 && hours % 24 === 0) return `${hours / 24} дней`;
  return `${hours} часов`;
}

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export async function fetchMlPredictions(signal?: AbortSignal): Promise<MlPredictionFeed> {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) return { items: [], contexts: {} };
  const response = await fetch(`${baseUrl}/api/v1/predictions?status=active`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`ML API returned ${response.status}`);
  const body = (await response.json()) as { items?: ApiPrediction[] };
  const source = Array.isArray(body.items) ? body.items : [];
  const items: UiPrediction[] = source.map((prediction) => ({
    id: prediction.id,
    object: prediction.object_name,
    district: prediction.district,
    type: prediction.incident_type,
    probability: Math.round(Math.max(0, Math.min(1, prediction.probability)) * 100),
    risk: riskLabels[prediction.risk] || 'Низкий',
    horizon: horizonLabel(prediction.horizon_hours),
    time: timeLabel(prediction.created_at),
    status: 'Новое',
    scoreKind: prediction.score_kind,
    targetNote: prediction.target_note,
    autoIncidentConfirmation: prediction.auto_incident_confirmation,
  }));
  const contexts = Object.fromEntries(
    source.map((prediction) => [
      prediction.id,
      {
        system: prediction.system,
        objectId: prediction.object_id,
        picket: prediction.picket,
        modelVersion: prediction.model_version,
        sources: prediction.sources || [],
        factors: (prediction.factors || []).map((factor) => ({
          label: factor.label,
          value: factor.value,
          impact: factor.impact <= 1 ? Math.round(factor.impact * 100) : Math.round(factor.impact),
          note: factor.note || '',
        })),
        relatedSignals: (prediction.related_signals || []).map((item) => ({
          time: timeLabel(item.timestamp),
          channel: String(item.channel_id),
          event: item.event,
          state: item.state,
        })),
        historicalMatch: prediction.historical_match || 'Историческое сопоставление не передано моделью.',
      },
    ]),
  );
  return { items, contexts };
}
