'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { MapObject } from './interactive-map';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  Download,
  Factory,
  Gauge,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MoreHorizontal,
  Moon,
  Pencil,
  RefreshCcw,
  Search,
  Send,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Thermometer,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const InteractiveMap = dynamic(() => import('./interactive-map'), {
  ssr: false,
});

type Risk = 'Критический' | 'Высокий' | 'Средний' | 'Низкий';
type UserRole = 'dispatcher' | 'technician' | 'manager';
type Section =
  | 'dashboard'
  | 'map'
  | 'predictions'
  | 'incidents'
  | 'equipment'
  | 'maintenance'
  | 'analytics';

type UserAccount = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  unit: string;
  district: string;
  active: boolean;
};

const roleLabels: Record<UserRole, string> = {
  dispatcher: 'Диспетчер ОДС или эксплуатационного подразделения',
  technician: 'Технический персонал по обслуживанию коллекторов',
  manager: 'Руководитель эксплуатационного подразделения',
};

const managerAccount: UserAccount = {
  id: 'admin',
  name: 'Руководитель подразделения',
  email: 'admin@moscollector.ru',
  password: 'admin2026',
  role: 'manager',
  unit: 'Эксплуатационное подразделение',
  district: 'Все округа',
  active: true,
};

const defaultDispatcherAccounts: UserAccount[] = [
  {
    id: 'dispatcher-default',
    name: 'Анна Крылова',
    email: 'dispatcher@moscollector.ru',
    password: 'monitoring2026',
    role: 'dispatcher',
    unit: 'Центральная ОДС',
    district: 'Все округа',
    active: true,
  },
  {
    id: 'dispatcher-south',
    name: 'Михаил Орлов',
    email: 'south@moscollector.ru',
    password: 'monitoring2026',
    role: 'dispatcher',
    unit: 'Эксплуатационный район №3',
    district: 'ЮАО',
    active: true,
  },
  {
    id: 'technician-default',
    name: 'Илья Соколов',
    email: 'tech@moscollector.ru',
    password: 'monitoring2026',
    role: 'technician',
    unit: 'Аварийно-ремонтная служба',
    district: 'ЮАО',
    active: true,
  },
];

const accountsStorageKey = 'moscollector-dispatcher-accounts';
const accountsStorageVersionKey = 'moscollector-accounts-version';
const sessionStorageKey = 'moscollector-current-user';
const themeStorageKey = 'moscollector-theme';
const deploymentBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

function deploymentPath(path: string) {
  return `${deploymentBasePath}${path}`;
}

function loadDispatcherAccounts() {
  try {
    const stored = window.localStorage.getItem(accountsStorageKey);
    if (!stored) return defaultDispatcherAccounts;
    const normalized = (JSON.parse(stored) as Array<Partial<UserAccount> & Pick<UserAccount, 'id' | 'name' | 'email' | 'password'>>)
      .map(
      (account) => ({
        ...account,
        role:
          String(account.role) === 'technician'
            ? 'technician'
            : String(account.role) === 'manager' || String(account.role) === 'admin'
              ? 'manager'
              : 'dispatcher',
        unit: account.unit || 'Центральная ОДС',
        district: account.district || 'Все округа',
        active: account.active !== false,
      }) as UserAccount,
    );
    if (window.localStorage.getItem(accountsStorageVersionKey) !== '4') {
      const migrated = [
        ...normalized,
        ...defaultDispatcherAccounts.filter((demo) => !normalized.some((account) => account.email.toLowerCase() === demo.email.toLowerCase())),
      ];
      window.localStorage.setItem(accountsStorageKey, JSON.stringify(migrated));
      window.localStorage.setItem(accountsStorageVersionKey, '4');
      return migrated;
    }
    return normalized;
  } catch {
    return defaultDispatcherAccounts;
  }
}

function storeDispatcherAccounts(accounts: UserAccount[]) {
  try {
    window.localStorage.setItem(accountsStorageKey, JSON.stringify(accounts));
    window.localStorage.setItem(accountsStorageVersionKey, '4');
  } catch {
    // Keep account management usable for the current session.
  }
}

function storeCurrentUser(user: UserAccount | null) {
  try {
    if (user) window.localStorage.setItem(sessionStorageKey, user.id);
    else window.localStorage.removeItem(sessionStorageKey);
  } catch {
    // Keep sign-in usable for the current session.
  }
}

function loadCurrentUser() {
  try {
    const userId = window.localStorage.getItem(sessionStorageKey);
    if (!userId) return null;
    const account = [managerAccount, ...loadDispatcherAccounts()].find(
      (account) => account.id === userId,
    );
    return account?.active ? account : null;
  } catch {
    return null;
  }
}

const nav: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { id: 'map', label: 'Карта объектов', icon: Map },
  { id: 'predictions', label: 'Прогнозы', icon: Sparkles },
  { id: 'incidents', label: 'Журнал', icon: Siren },
  { id: 'equipment', label: 'Оборудование', icon: Factory },
  { id: 'maintenance', label: 'Заявки', icon: Wrench },
  { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
];

const roleSections: Record<Exclude<UserRole, 'manager'>, Section[]> = {
  dispatcher: ['dashboard', 'map', 'predictions', 'incidents', 'equipment', 'maintenance', 'analytics'],
  technician: ['dashboard', 'map', 'equipment', 'maintenance'],
};

const predictions = [
  {
    id: 'PR-2491',
    object: 'КНС «Нагатинская»',
    district: 'ЮАО',
    type: 'Перегрев насоса №3',
    probability: 94,
    risk: 'Критический' as Risk,
    horizon: '24 часа',
    time: 'Сегодня, 09:42',
    status: 'Новое',
  },
  {
    id: 'PR-2490',
    object: 'Тепловой пункт ТП-184',
    district: 'ЦАО',
    type: 'Падение давления',
    probability: 82,
    risk: 'Высокий' as Risk,
    horizon: '24 часа',
    time: 'Сегодня, 09:18',
    status: 'В работе',
  },
  {
    id: 'PR-2489',
    object: 'Коллектор К-17',
    district: 'СВАО',
    type: 'Превышение уровня',
    probability: 76,
    risk: 'Высокий' as Risk,
    horizon: '36 часов',
    time: 'Сегодня, 08:57',
    status: 'В работе',
  },
  {
    id: 'PR-2488',
    object: 'Водозаборный узел ВЗУ-7',
    district: 'ЗАО',
    type: 'Аномальная вибрация',
    probability: 61,
    risk: 'Средний' as Risk,
    horizon: '24 часа',
    time: 'Сегодня, 08:31',
    status: 'Наблюдение',
  },
  {
    id: 'PR-2487',
    object: 'ЦТП «Лефортово»',
    district: 'ЮВАО',
    type: 'Снижение расхода',
    probability: 34,
    risk: 'Низкий' as Risk,
    horizon: '48 часов',
    time: 'Сегодня, 07:46',
    status: 'Закрыто',
  },
];

const maintenanceJobs = [
  {
    id: 'REC-410',
    risk: 'Критический' as Risk,
    probability: 94,
    object: 'КНС «Нагатинская»',
    title: 'Диагностика насоса №3',
    deadline: 'Сегодня, до 14:00',
  },
  {
    id: 'REC-411',
    risk: 'Высокий' as Risk,
    probability: 82,
    object: 'Тепловой пункт ТП-184',
    title: 'Проверка контура давления',
    deadline: 'Сегодня, до 18:00',
  },
  {
    id: 'REC-412',
    risk: 'Высокий' as Risk,
    probability: 76,
    object: 'Коллектор К-17',
    title: 'Осмотр датчика уровня',
    deadline: '16 сентября',
  },
  {
    id: 'REC-413',
    risk: 'Средний' as Risk,
    probability: 61,
    object: 'Водозаборный узел ВЗУ-7',
    title: 'Балансировка насоса',
    deadline: '18 сентября',
  },
];

type SentRequest = (typeof maintenanceJobs)[number] & {
  requestId: string;
  sentAt: string;
  status: string;
  sourcePredictionId?: string;
  dispatcherComment?: string;
  assignedUnit?: string;
  result?: string;
  statusHistory?: { status: string; at: string; author: string }[];
};

type ArchivedRequest = SentRequest & {
  archivedAt: string;
  technicianResponse: string;
  closedBy: string;
};

const sentRequestsStorageKey = 'moscollector-sent-requests';
const archivedRequestsStorageKey = 'moscollector-archived-requests';
const initialSentRequests: SentRequest[] = [
  {
    ...maintenanceJobs[1],
    requestId: 'RQ-1087',
    sentAt: 'Сегодня, 09:18',
    status: 'Принята',
    assignedUnit: 'Аварийно-ремонтная бригада №14',
    statusHistory: [{ status: 'Принята', at: 'Сегодня, 09:18', author: 'Система заявок' }],
  },
  {
    ...maintenanceJobs[3],
    requestId: 'RQ-1086',
    sentAt: 'Вчера, 17:42',
    status: 'В работе',
    assignedUnit: 'Аварийно-ремонтная бригада №7',
    statusHistory: [
      { status: 'Принята', at: 'Вчера, 17:42', author: 'Система заявок' },
      { status: 'В работе', at: 'Сегодня, 08:05', author: 'Бригада №7' },
    ],
  },
];

function loadSentRequests() {
  try {
    const saved = window.localStorage.getItem(sentRequestsStorageKey);
    return saved
      ? (JSON.parse(saved) as SentRequest[]).map((request) => ({
          ...request,
          assignedUnit: request.assignedUnit || 'Аварийно-ремонтная бригада',
          statusHistory: request.statusHistory || [
            { status: request.status, at: request.sentAt, author: 'Система заявок' },
          ],
        }))
      : initialSentRequests;
  } catch {
    return initialSentRequests;
  }
}

function storeSentRequests(requests: SentRequest[]) {
  try {
    window.localStorage.setItem(
      sentRequestsStorageKey,
      JSON.stringify(requests),
    );
  } catch {
    // Keep the interaction usable even when browser storage is disabled.
  }
}

function loadArchivedRequests() {
  try {
    const saved = window.localStorage.getItem(archivedRequestsStorageKey);
    return saved ? (JSON.parse(saved) as ArchivedRequest[]) : [];
  } catch {
    return [];
  }
}

function storeArchivedRequests(requests: ArchivedRequest[]) {
  try {
    window.localStorage.setItem(
      archivedRequestsStorageKey,
      JSON.stringify(requests),
    );
  } catch {
    // Keep the active workflow usable when browser storage is disabled.
  }
}

type JournalEntry = {
  predictionId: string;
  date: string;
  object: string;
  type: string;
  probability: string;
  fact: string;
  decision: string;
  dispatcher: string;
  comment: string;
  status: string;
};

const journalStorageKey = 'moscollector-journal';

function journalStatus(decision: string) {
  if (decision === 'Направить бригаду') return 'В работе';
  if (decision === 'Продолжить мониторинг') return 'Наблюдение';
  if (decision === 'Передать ответственному') return 'Передан';
  return 'Закрыт';
}

function journalFact(decision: string) {
  if (decision === 'Направить бригаду') return 'Ожидается';
  if (decision === 'Продолжить мониторинг') return 'Не наступил';
  if (decision === 'Передать ответственному') return 'На проверке';
  if (decision === 'Закрыть после проверки') return 'Проверен';
  return 'Не подтверждён';
}

function journalStatusClass(status: string) {
  if (status === 'Закрыт') return 'status-success';
  if (status === 'В работе') return 'status-warning';
  if (status === 'Наблюдение') return 'status-monitoring';
  return 'status-neutral';
}

function loadJournalEntries() {
  try {
    const stored = window.localStorage.getItem(journalStorageKey);
    const entries = stored ? (JSON.parse(stored) as JournalEntry[]) : [];

    predictions.forEach((prediction) => {
      if (entries.some((entry) => entry.predictionId === prediction.id)) return;
      const saved = window.localStorage.getItem(
        `moscollector-decision-${prediction.id}`,
      );
      if (!saved) return;
      const decision = JSON.parse(saved) as {
        decision: string;
        comment: string;
        savedAt?: string;
        dispatcher?: string;
      };
      entries.push({
        predictionId: prediction.id,
        date: decision.savedAt
          ? new Date(decision.savedAt).toLocaleString('ru-RU', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Сегодня',
        object: prediction.object,
        type: prediction.type,
        probability: `${prediction.probability}%`,
        fact: journalFact(decision.decision),
        decision: decision.decision,
        dispatcher: decision.dispatcher || 'А. Крылова',
        comment: decision.comment || 'Комментарий не указан',
        status: journalStatus(decision.decision),
      });
    });
    window.localStorage.setItem(journalStorageKey, JSON.stringify(entries));
    return entries;
  } catch {
    return [];
  }
}

function storeJournalEntry(entry: JournalEntry) {
  const entries = loadJournalEntries();
  const next = [
    entry,
    ...entries.filter((item) => item.predictionId !== entry.predictionId),
  ];
  try {
    window.localStorage.setItem(journalStorageKey, JSON.stringify(next));
  } catch {
    // The decision remains visible for the current session.
  }
}

const equipment = [
  {
    id: 'EQ-1034',
    object: 'КНС «Нагатинская»',
    type: 'Насос Grundfos CR 95',
    state: 'Требует внимания',
    value: '87 °C',
    risk: 94,
    last: '12.08.2026',
    next: '16.09.2026',
  },
  {
    id: 'EQ-2088',
    object: 'ТП-184',
    type: 'Датчик давления',
    state: 'Нестабильно',
    value: '2,1 бар',
    risk: 82,
    last: '02.09.2026',
    next: '02.10.2026',
  },
  {
    id: 'EQ-1541',
    object: 'Коллектор К-17',
    type: 'Датчик уровня',
    state: 'Работает',
    value: '4,62 м',
    risk: 76,
    last: '28.08.2026',
    next: '28.09.2026',
  },
  {
    id: 'EQ-3102',
    object: 'ВЗУ-7',
    type: 'Насос ЭЦВ 10-120',
    state: 'Работает',
    value: '3,8 мм/с',
    risk: 61,
    last: '01.09.2026',
    next: '01.11.2026',
  },
  {
    id: 'EQ-912',
    object: 'ЦТП «Лефортово»',
    type: 'Расходомер',
    state: 'Исправно',
    value: '129 м³/ч',
    risk: 18,
    last: '11.09.2026',
    next: '11.12.2026',
  },
];

const mapObjects: MapObject[] = [
  {
    id: 'OBJ-101',
    predictionId: 'PR-2491',
    name: 'Коллектор Нагатинский',
    address: 'Нагатинская наб., 18',
    district: 'ЮАО',
    system: 'Водоудаление',
    incident: 'Перегрев насоса',
    risk: 'critical',
    probability: 94,
    position: [55.6845, 37.6382],
    geometry: [[70, 110], [170, 120], [270, 145], [365, 180]],
    picketFrom: 110,
    picketTo: 150,
    sensors: 42,
    onlineSensors: 42,
    connection: 'Онлайн',
  },
  {
    id: 'OBJ-184',
    predictionId: 'PR-2490',
    name: 'Коллектор Якиманка',
    address: 'ул. Большая Якиманка, 24',
    district: 'ЦАО',
    system: 'Температурный контроль',
    incident: 'Падение давления',
    risk: 'high',
    probability: 82,
    position: [55.7359, 37.6127],
    geometry: [[365, 180], [430, 230], [452, 286], [520, 325]],
    picketFrom: 40,
    picketTo: 80,
    sensors: 36,
    onlineSensors: 35,
    connection: 'Нестабильно',
  },
  {
    id: 'OBJ-017',
    predictionId: 'PR-2489',
    name: 'Коллектор К-17',
    address: 'ул. Шереметьевская, 36',
    district: 'СВАО',
    system: 'Водоудаление',
    incident: 'Превышение уровня',
    risk: 'high',
    probability: 76,
    position: [55.8012, 37.6175],
    geometry: [[452, 286], [560, 250], [670, 220], [825, 205]],
    picketFrom: 210,
    picketTo: 250,
    sensors: 54,
    onlineSensors: 54,
    connection: 'Онлайн',
  },
  {
    id: 'OBJ-207',
    predictionId: 'PR-2488',
    name: 'Коллектор Рублёвский',
    address: 'Рублёвское ш., 82',
    district: 'ЗАО',
    system: 'Насосная автоматика',
    incident: 'Аномальная вибрация',
    risk: 'medium',
    probability: 61,
    position: [55.7382, 37.4248],
    geometry: [[85, 345], [190, 320], [300, 315], [452, 286]],
    picketFrom: 70,
    picketTo: 110,
    sensors: 28,
    onlineSensors: 28,
    connection: 'Онлайн',
  },
  {
    id: 'OBJ-312',
    predictionId: 'PR-2487',
    name: 'Коллектор Лефортово',
    address: 'Красноказарменная ул., 13',
    district: 'ЮВАО',
    system: 'Газовый контроль',
    incident: 'Снижение расхода',
    risk: 'low',
    probability: 34,
    position: [55.7586, 37.7026],
    geometry: [[520, 325], [625, 350], [730, 335], [845, 300]],
    picketFrom: 130,
    picketTo: 170,
    sensors: 31,
    onlineSensors: 31,
    connection: 'Онлайн',
  },
  {
    id: 'OBJ-409',
    name: 'Коллектор Пресненский',
    address: 'Шмитовский пр., 29',
    district: 'ЦАО',
    system: 'Охранная сигнализация',
    incident: 'Одиночное движение',
    risk: 'medium',
    probability: 57,
    position: [55.7548, 37.5486],
    geometry: [[105, 475], [220, 450], [335, 455], [445, 470]],
    picketFrom: 20,
    picketTo: 60,
    sensors: 39,
    onlineSensors: 38,
    connection: 'Нестабильно',
  },
  {
    id: 'OBJ-511',
    name: 'Коллектор Басманный',
    address: 'Спартаковская ул., 16',
    district: 'ЦАО',
    system: 'Пожарная система',
    incident: 'Отклонений нет',
    risk: 'low',
    probability: 12,
    position: [55.7721, 37.6804],
    geometry: [[445, 470], [555, 465], [665, 475], [810, 455]],
    picketFrom: 310,
    picketTo: 350,
    sensors: 47,
    onlineSensors: 47,
    connection: 'Онлайн',
  },
  {
    id: 'OBJ-608',
    name: 'Коллектор Останкинский',
    address: '1-я Останкинская ул., 7',
    district: 'СВАО',
    system: 'Связь и телеметрия',
    incident: 'Потеря связи',
    risk: 'high',
    probability: 79,
    position: [55.8231, 37.6225],
    geometry: [[610, 75], [680, 105], [755, 135], [825, 205]],
    picketFrom: 400,
    picketTo: 440,
    sensors: 33,
    onlineSensors: 0,
    connection: 'Нет связи',
  },
];

const trend = [
  { t: '00:00', predictions: 14, incidents: 3 },
  { t: '04:00', predictions: 18, incidents: 4 },
  { t: '08:00', predictions: 31, incidents: 7 },
  { t: '12:00', predictions: 26, incidents: 5 },
  { t: '16:00', predictions: 38, incidents: 9 },
  { t: '20:00', predictions: 29, incidents: 6 },
  { t: '24:00', predictions: 34, incidents: 5 },
];
const sensorData = [
  { t: '04:00', temp: 58, vibration: 2.1, pressure: 4.8 },
  { t: '06:00', temp: 61, vibration: 2.3, pressure: 4.7 },
  { t: '08:00', temp: 66, vibration: 2.8, pressure: 4.5 },
  { t: '10:00', temp: 71, vibration: 3.2, pressure: 4.4 },
  { t: '12:00', temp: 78, vibration: 4.1, pressure: 4.1 },
  { t: '14:00', temp: 82, vibration: 4.8, pressure: 3.9 },
  { t: '16:00', temp: 87, vibration: 5.6, pressure: 3.7 },
];
const analyticsMonths = [
  { m: 'Апр', precision: 81, recall: 73 },
  { m: 'Май', precision: 83, recall: 75 },
  { m: 'Июн', precision: 84, recall: 78 },
  { m: 'Июл', precision: 87, recall: 81 },
  { m: 'Авг', precision: 89, recall: 84 },
  { m: 'Сен', precision: 91, recall: 86 },
];

const predictionContexts: Record<string, {
  system: string;
  objectId: string;
  picket: string;
  modelVersion: string;
  sources: string[];
  factors: { label: string; value: string; impact: number; note: string }[];
  relatedSignals: { time: string; channel: string; event: string; state: string }[];
  historicalMatch: string;
}> = {
  'PR-2491': {
    system: 'Водоудаление', objectId: 'OBJ-101', picket: 'ПК 130', modelVersion: 'ML API · ожидается подключение',
    sources: ['СМВУ', 'Реестр оборудования', 'Журнал ОДС'],
    factors: [
      { label: 'Рост температуры', value: '87 °C', impact: 42, note: 'выше порога 80 °C в течение 38 минут' },
      { label: 'Вибрация насоса', value: '5,6 мм/с', impact: 31, note: 'устойчивый рост на трёх интервалах' },
      { label: 'Падение давления', value: '3,7 бар', impact: 17, note: 'на 0,3 бар ниже рабочего диапазона' },
      { label: 'История оборудования', value: '18 420 ч', impact: 10, note: 'приближение к сервисному интервалу' },
    ],
    relatedSignals: [
      { time: '09:42', channel: 'CH-56682', event: 'Температура выше порога', state: 'Подтверждено' },
      { time: '09:39', channel: 'CH-183582', event: 'Рост вибрации', state: 'Подтверждено' },
      { time: '09:35', channel: 'CH-215811', event: 'Давление ниже нормы', state: 'Связано' },
    ],
    historicalMatch: 'Похожий набор сигналов встречался 7 раз; в 5 случаях потребовался осмотр подшипникового узла.',
  },
};

const defaultPredictionContext = {
  system: 'Инженерная система', objectId: 'OBJ-DEMO', picket: 'ПК 80', modelVersion: 'ML API · ожидается подключение',
  sources: ['СМВУ', 'Реестр оборудования'],
  factors: [
    { label: 'Отклонение показаний', value: '+18%', impact: 46, note: 'устойчиво на нескольких интервалах' },
    { label: 'Связанные датчики', value: '3 канала', impact: 34, note: 'сигналы подтверждают общий сценарий' },
    { label: 'Исторический паттерн', value: '6 совпадений', impact: 20, note: 'аналогичные случаи в журнале' },
  ],
  relatedSignals: [
    { time: '09:18', channel: 'CH-56682', event: 'Отклонение от рабочего диапазона', state: 'Подтверждено' },
    { time: '09:12', channel: 'CH-183582', event: 'Связанный сигнал', state: 'Связано' },
  ],
  historicalMatch: 'Найдены исторические случаи с похожей последовательностью сигналов. Итог требует проверки диспетчером.',
};

function riskClass(risk: Risk) {
  return `risk risk-${risk.toLowerCase()}`;
}
function riskFromNumber(n: number): Risk {
  return n >= 90
    ? 'Критический'
    : n >= 70
      ? 'Высокий'
      : n >= 40
        ? 'Средний'
        : 'Низкий';
}

function downloadFile(
  name: string,
  content: string,
  type = 'text/plain;charset=utf-8',
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function MoscollectorApp() {
  const [section, setSection] = useState<Section>('dashboard');
  const [detail, setDetail] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(
    defaultDispatcherAccounts[0],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [darkTheme, setDarkTheme] = useState(false);
  useEffect(() => {
    const storedTheme = window.localStorage.getItem(themeStorageKey);
    const useDarkTheme =
      storedTheme === 'dark' ||
      (!storedTheme &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDarkTheme(useDarkTheme);
    document.documentElement.dataset.theme = useDarkTheme ? 'dark' : 'light';
  }, []);
  const toggleTheme = () => {
    setDarkTheme((current) => {
      const next = !current;
      document.documentElement.dataset.theme = next ? 'dark' : 'light';
      window.localStorage.setItem(themeStorageKey, next ? 'dark' : 'light');
      return next;
    });
  };
  useEffect(() => {
    const path =
      window.location.pathname.slice(deploymentBasePath.length) || '/';
    if (path === '/login' || path === '/login/') {
      setCurrentUser(null);
    } else {
      const storedUser = loadCurrentUser();
      if (storedUser) setCurrentUser(storedUser);
      if ((path === '/admin' || path === '/admin/') && !storedUser)
        setCurrentUser(null);
    }
    const found = nav.find((item) => path.startsWith(`/${item.id}`));
    if (found) setSection(found.id);
    const pieces = path.split('/').filter(Boolean);
    if ((pieces[0] === 'predictions' || pieces[0] === 'equipment') && pieces[1])
      setDetail(pieces[1]);
  }, []);
  useEffect(() => {
    if (!currentUser || currentUser.role === 'manager') return;
    if (roleSections[currentUser.role].includes(section)) return;
    setSection('dashboard');
    setDetail(null);
    window.history.replaceState({}, '', deploymentPath('/dashboard/'));
  }, [currentUser, section]);
  const go = (next: Section, id?: string) => {
    if (currentUser && currentUser.role !== 'manager' && !roleSections[currentUser.role].includes(next)) {
      notify('У вашей роли нет доступа к этому разделу');
      return;
    }
    setSection(next);
    setDetail(id || null);
    setMenuOpen(false);
    window.history.pushState(
      {},
      '',
      deploymentPath(id ? `/${next}/${id}/` : `/${next}/`),
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  };
  if (!currentUser)
    return (
      <Login
        darkTheme={darkTheme}
        onToggleTheme={toggleTheme}
        onLogin={(user) => {
          setCurrentUser(user);
          storeCurrentUser(user);
          if (user.role === 'manager') {
            window.history.pushState({}, '', deploymentPath('/admin/'));
          } else {
            go('dashboard');
          }
        }}
      />
    );
  if (currentUser.role === 'manager') {
    return (
      <AdminPanel
        user={currentUser}
        darkTheme={darkTheme}
        onToggleTheme={toggleTheme}
        onLogout={() => {
          setCurrentUser(null);
          storeCurrentUser(null);
          window.history.pushState({}, '', deploymentPath('/login/'));
        }}
      />
    );
  }
  const currentRole = currentUser.role as Exclude<UserRole, 'manager'>;
  const visibleNav = nav.filter((item) => roleSections[currentRole].includes(item.id));
  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={19} />
          </div>
          <div>
            <strong>МосКоллектор</strong>
            <span>Городская диспетчерская</span>
          </div>
        </div>
        <nav className="main-nav" aria-label="Основная навигация">
          <span className="nav-caption">Рабочее пространство</span>
          {visibleNav.filter((item) => item.id !== 'analytics').map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={section === item.id}
              onClick={() => go(item.id)}
            />
          ))}
          <span className="nav-caption nav-caption-second">Управление</span>
          {visibleNav.filter((item) => item.id === 'analytics').map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={section === item.id}
              onClick={() => go(item.id)}
            />
          ))}
        </nav>
        <button
          className="profile"
          onClick={() => {
            setCurrentUser(null);
            storeCurrentUser(null);
            window.history.pushState({}, '', deploymentPath('/login/'));
          }}
        >
          <span className="avatar">
            {currentUser.name
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)}
          </span>
          <span>
            <strong>{currentUser.name}</strong>
            <small>{roleLabels[currentUser.role]}</small>
          </span>
          <LogOut size={16} />
        </button>
      </aside>
      <main className="main">
        <Header
          section={section}
          user={currentUser}
          darkTheme={darkTheme}
          onToggleTheme={toggleTheme}
          onMenu={() => setMenuOpen(!menuOpen)}
          onNotify={notify}
        />
        <div className="content">
          {section === 'dashboard' && (
            <Dashboard go={go} notify={notify} user={currentUser} />
          )}
          {section === 'map' && <MapPage go={go} notify={notify} user={currentUser} />}
          {section === 'predictions' &&
            (detail ? (
              <PredictionDetail
                id={detail}
                go={go}
                notify={notify}
                dispatcher={currentUser}
              />
            ) : (
              <Predictions go={go} notify={notify} user={currentUser} />
            ))}
          {section === 'incidents' && <Incidents notify={notify} />}
          {section === 'equipment' &&
            (detail ? (
              <EquipmentDetail id={detail} go={go} notify={notify} />
            ) : (
              <EquipmentPage go={go} notify={notify} />
            ))}
          {section === 'maintenance' && <Maintenance notify={notify} user={currentUser} />}
          {section === 'analytics' && <Analytics notify={notify} />}
        </div>
      </main>
      {menuOpen && (
        <button
          aria-label="Закрыть меню"
          className="menu-backdrop"
          onClick={() => setMenuOpen(false)}
        />
      )}
      {toast && (
        <div className="toast">
          <span>
            <Check size={16} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: (typeof nav)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon size={19} />
      <span>{item.label}</span>
      {item.id === 'predictions' && <b>7</b>}
    </button>
  );
}
function Header({
  section,
  user,
  darkTheme,
  onToggleTheme,
  onMenu,
  onNotify,
}: {
  section: Section;
  user: UserAccount;
  darkTheme: boolean;
  onToggleTheme: () => void;
  onMenu: () => void;
  onNotify: (s: string) => void;
}) {
  const titles: Record<Section, string> = {
    dashboard: 'Ситуационный центр',
    map: 'Карта объектов',
    predictions: 'Прогнозы',
    incidents: 'Журнал',
    equipment: 'Оборудование',
    maintenance: 'Заявки',
    analytics: 'Аналитика',
  };
  return (
    <header className="topbar">
      <button className="icon-btn mobile-menu" onClick={onMenu}>
        <Menu size={20} />
      </button>
      <div>
        <p className="eyebrow">Инженерная инфраструктура Москвы</p>
        <h1>{titles[section]}</h1>
      </div>
      <div className="top-actions">
        <span className="shift-badge">
          Смена 01 <i /> {user.district === 'Все округа' ? 'Все округа' : user.district}
        </span>
        <ThemeToggle darkTheme={darkTheme} onToggle={onToggleTheme} />
        <button
          className="icon-btn notification"
          onClick={() => onNotify('Новых уведомлений: 3')}
        >
          <Bell size={19} />
          <b>3</b>
        </button>
        <button
          className="avatar top-avatar"
          onClick={() => onNotify(`${user.name} · ${roleLabels[user.role]}`)}
        >
          {user.name
            .split(' ')
            .map((part) => part[0])
            .join('')
            .slice(0, 2)}
        </button>
      </div>
    </header>
  );
}

function ThemeToggle({
  darkTheme,
  onToggle,
}: {
  darkTheme: boolean;
  onToggle: () => void;
}) {
  const label = darkTheme ? 'Включить светлую тему' : 'Включить тёмную тему';
  return (
    <button
      className="icon-btn theme-toggle"
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      {darkTheme ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
function Metric({ icon: Icon, label, value, note, tone, trend }: any) {
  return (
    <div className="metric">
      <div className={`metric-icon ${tone}`}>
        <Icon size={20} />
      </div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
      <span className={`metric-trend ${tone}`}>{trend}</span>
    </div>
  );
}
function PanelHead({
  title,
  subtitle,
  link,
  onClick,
}: {
  title: string;
  subtitle?: string;
  link?: string;
  onClick?: () => void;
}) {
  return (
    <div className="panel-head">
      <div>
        <h3>{title}</h3>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {link && (
        <button onClick={onClick}>
          {link}
          <ChevronRight size={15} />
        </button>
      )}
    </div>
  );
}

function Dashboard({
  go,
  notify,
  user,
}: {
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
  user: UserAccount;
}) {
  const shiftDate = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  const dashboardPredictions = predictions.filter((prediction) => user.district === 'Все округа' || prediction.district === user.district);
  return (
    <>
      <PageHead
        title="Сводка смены"
        subtitle={`${roleLabels[user.role]} ${user.name} · ${shiftDate}`}
        action={
          <button
            className="secondary-btn"
            onClick={() => notify('Данные дашборда обновлены')}
          >
            <RefreshCcw size={16} /> Обновить
          </button>
        }
      />
      <div className="metric-grid">
        <Metric
          icon={AlertTriangle}
          label="Критические риски"
          value={String(dashboardPredictions.filter((prediction) => prediction.risk === 'Критический').length)}
          note="требуют решения"
          tone="red"
          trend="+1 за час"
        />
        <Metric
          icon={Siren}
          label="Высокий риск"
          value="12"
          note="объектов"
          tone="orange"
          trend="−2 за сутки"
        />
        <Metric
          icon={Sparkles}
          label="Прогнозы за 24 ч"
          value="184"
          note="по 1 247 объектам"
          tone="purple"
          trend="+8,4%"
        />
        <Metric
          icon={ShieldCheck}
          label="Исправное оборудование"
          value="96,8%"
          note="12 074 единицы"
          tone="green"
          trend="+0,3%"
        />
        <Metric
          icon={TrendingDown}
          label="Ложные тревоги"
          value="4,7%"
          note="ниже целевых 6%"
          tone="yellow"
          trend="−0,8 п.п."
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel risk-panel">
          <PanelHead
            title="Главные риски"
            subtitle="Наиболее вероятные инциденты"
            link="Все прогнозы"
            onClick={() => go('predictions')}
          />
          <div className="risk-list">
            {dashboardPredictions.slice(0, 3).map((p, i) => (
              <button
                key={p.id}
                className="risk-row"
                onClick={() => go('predictions', p.id)}
              >
                <span className={`risk-rank r${i + 1}`}>{i + 1}</span>
                <span className="risk-main">
                  <strong>{p.object}</strong>
                  <small>{p.type}</small>
                </span>
                <span className="risk-prob">
                  <strong>{p.probability}%</strong>
                  <small>{p.horizon}</small>
                </span>
                <span className={riskClass(p.risk)}>{p.risk}</span>
                <ChevronRight size={17} />
              </button>
            ))}
          </div>
        </section>
        <section className="panel map-mini">
          <PanelHead
            title="Карта рисков"
            subtitle="1 247 объектов онлайн"
            link="Открыть карту"
            onClick={() => go('map')}
          />
          <MiniMap
            onMap={() => go('map')}
            onCritical={() => go('predictions', 'PR-2491')}
          />
        </section>
        <section className="panel chart-panel">
          <PanelHead
            title="Динамика за 24 часа"
            subtitle="Прогнозы и подтверждённые инциденты"
            link="Аналитика"
            onClick={() => go('analytics')}
          />
          <div className="legend">
            <span>
              <i className="legend-purple" /> Прогнозы
            </span>
            <span>
              <i className="legend-orange" /> Инциденты
            </span>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 240 }}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id="predFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6246D9" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="#6246D9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#eeedf3" />
                <XAxis dataKey="t" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="predictions"
                  stroke="#6246D9"
                  strokeWidth={2.5}
                  fill="url(#predFill)"
                />
                <Line
                  type="monotone"
                  dataKey="incidents"
                  stroke="#EA580C"
                  strokeWidth={2.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel latest-panel">
          <PanelHead
            title="Последние прогнозы"
            link="Смотреть все"
            onClick={() => go('predictions')}
          />
          <PredictionTable
            rows={dashboardPredictions.slice(0, 4)}
            onRow={(id) => go('predictions', id)}
          />
        </section>
      </div>
    </>
  );
}

function MiniMap({
  onCritical,
  onMap,
}: {
  onCritical?: () => void;
  onMap: () => void;
}) {
  return (
    <div className="map-canvas mini">
      <div className="roads road-a" />
      <div className="roads road-b" />
      <div className="roads road-c" />
      <span className="river" />
      <MapMarker risk="low" x="19%" y="25%" onClick={onMap} />
      <MapMarker risk="medium" x="61%" y="19%" onClick={onMap} />
      <MapMarker risk="high" x="76%" y="62%" onClick={onMap} />
      <MapMarker risk="low" x="39%" y="69%" onClick={onMap} />
      <MapMarker risk="critical" x="52%" y="45%" onClick={onCritical} />
      <div className="map-label label-center">Москва</div>
      <div className="map-attribution">Схема объектов • ОДС</div>
    </div>
  );
}
function MapMarker({
  risk,
  x,
  y,
  onClick,
}: {
  risk: string;
  x: string;
  y: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={`Объект, риск: ${risk}`}
      className={`map-marker marker-${risk}`}
      style={{ left: x, top: y }}
      onClick={onClick}
    >
      <span />
    </button>
  );
}

function MapPage({
  go,
  notify,
  user,
}: {
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
  user: UserAccount;
}) {
  const [query, setQuery] = useState('');
  const [risk, setRisk] = useState('all');
  const [district, setDistrict] = useState('all');
  const [incident, setIncident] = useState('all');
  const [system, setSystem] = useState('all');
  const [selectedId, setSelectedId] = useState('OBJ-101');
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
  const selected =
    filtered.find((object) => object.id === selectedId) ||
    filtered[0] ||
    mapObjects[0];
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
        geometry: {
          type: 'LineString',
          coordinates: object.geometry.map(([x, y]) => [x, y]),
        },
        properties: {
          id: object.id,
          name: object.name,
          system: object.system,
          picket_from: object.picketFrom,
          picket_to: object.picketTo,
          risk: object.risk,
          probability: object.probability,
          demo_geometry: true,
        },
      })),
    };
    downloadFile(
      'moscollector-objects.geojson',
      JSON.stringify(geojson, null, 2),
      'application/geo+json',
    );
    notify('GeoJSON выгружен');
  };
  const resetFilters = () => {
    setQuery('');
    setRisk('all');
    setDistrict('all');
    setIncident('all');
    setSystem('all');
    notify('Фильтры сброшены');
  };
  return (
    <>
      <PageHead
        title="Карта инженерных объектов"
        subtitle="Схема коллекторов, пикетов и инженерных систем"
        action={
          <div className="inline-actions">
            <button className="secondary-btn" onClick={exportGeoJson}>
              <Download size={16} /> GeoJSON
            </button>
            <button className="primary-btn" onClick={() => notify('Телеметрия объектов обновлена')}>
              <RefreshCcw size={16} /> Обновить
            </button>
          </div>
        }
      />
      <div className="filters">
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
        <button className="filter-btn" onClick={resetFilters}>
          <SlidersHorizontal size={17} />
          Сбросить
        </button>
      </div>
      <div className="map-layout">
        <div className="real-map-wrap">
          <InteractiveMap
            objects={filtered}
            selectedId={selected.id}
            onSelect={setSelectedId}
          />
          {filtered.length === 0 && (
            <div className="map-empty">
              По выбранным условиям объектов не найдено
            </div>
          )}
        </div>
        <aside className="object-card">
          <div className="object-image">
            <Factory size={32} />
            <span className={riskClass(riskLabels[selected.risk])}>
              {riskLabels[selected.risk]}
            </span>
          </div>
          <div className="object-card-body">
            <span className="object-id">
              {selected.id} · {selected.district}
            </span>
            <h3>{selected.name}</h3>
            <p>{selected.address}</p>
            <p className="object-system">{selected.system} · ПК {selected.picketFrom}—{selected.picketTo}</p>
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
                <strong>{selected.incident}</strong>
                <small>Вероятность {selected.probability}%</small>
              </span>
            </div>
            <button
              className="primary-btn full"
              disabled={!selected.predictionId}
              onClick={() => selected.predictionId && go('predictions', selected.predictionId)}
            >
              {selected.predictionId ? 'Открыть прогноз' : 'Активного прогноза нет'} <ChevronRight size={16} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function Predictions({
  go,
  notify,
  user,
}: {
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
  user: UserAccount;
}) {
  const [page, setPage] = useState(1);
  const visiblePredictions = predictions.filter((prediction) => user.district === 'Все округа' || prediction.district === user.district);
  const changePage = (next: number) => {
    setPage(Math.max(1, Math.min(23, next)));
    notify(`Открыта страница ${Math.max(1, Math.min(23, next))}`);
  };
  const exportRows = () => {
    const csv = [
      'ID;Объект;Инцидент;Вероятность;Риск;Горизонт',
      ...visiblePredictions.map(
        (p) =>
          `${p.id};${p.object};${p.type};${p.probability}%;${p.risk};${p.horizon}`,
      ),
    ].join('\n');
    downloadFile('predictions.csv', `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    notify('Прогнозы выгружены в CSV');
  };
  return (
    <>
      <PageHead
        title="Прогнозы инцидентов"
        subtitle={`${visiblePredictions.length} активных прогнозов · область: ${user.district}`}
        action={
          <button className="secondary-btn" onClick={exportRows}>
            <Download size={16} /> Экспорт
          </button>
        }
      />
      <div className="panel table-panel">
        <PredictionTable
          rows={visiblePredictions}
          onRow={(id) => go('predictions', id)}
        />
        <div className="pagination">
          <span>Страница {page} · показано {visiblePredictions.length}</span>
          <div>
            <button disabled={page === 1} onClick={() => changePage(page - 1)}>
              Назад
            </button>
            {[1, 2, 3].map((x) => (
              <button
                key={x}
                className={page === x ? 'active' : ''}
                onClick={() => changePage(x)}
              >
                {x}
              </button>
            ))}
            <button onClick={() => changePage(Math.min(22, page + 5))}>
              …
            </button>
            <button
              className={page === 23 ? 'active' : ''}
              onClick={() => changePage(23)}
            >
              23
            </button>
            <button disabled={page === 23} onClick={() => changePage(page + 1)}>
              Вперёд
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
function PredictionTable({
  rows,
  onRow,
}: {
  rows: typeof predictions;
  onRow: (id: string) => void;
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Объект</th>
            <th>Инцидент</th>
            <th>Вероятность</th>
            <th>Риск</th>
            <th>Горизонт</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} onClick={() => onRow(p.id)}>
              <td>
                <strong>{p.object}</strong>
                <small>
                  {p.id} · {p.district}
                </small>
              </td>
              <td>{p.type}</td>
              <td>
                <div className="prob">
                  <span>
                    <i
                      style={{ width: `${p.probability}%` }}
                      className={`bar-${p.risk.toLowerCase()}`}
                    />
                  </span>
                  <strong>{p.probability}%</strong>
                </div>
              </td>
              <td>
                <span className={riskClass(p.risk)}>
                  <i />
                  {p.risk}
                </span>
              </td>
              <td>
                <strong>{p.horizon}</strong>
                <small>{p.time}</small>
              </td>
              <td>
                <ChevronRight size={17} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PredictionDetail({
  id,
  go,
  notify,
  dispatcher,
}: {
  id: string;
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
  dispatcher: UserAccount;
}) {
  const [decision, setDecision] = useState('');
  const [reasonCategory, setReasonCategory] = useState('');
  const [reason, setReason] = useState('');
  const [saved, setSaved] = useState(false);
  const [sensor, setSensor] = useState<'temp' | 'vibration' | 'pressure'>(
    'temp',
  );
  const [menu, setMenu] = useState(false);
  const [claimedBy, setClaimedBy] = useState('');
  const p = predictions.find((x) => x.id === id) || predictions[0];
  const context = predictionContexts[p.id] || defaultPredictionContext;
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(
        `moscollector-decision-${p.id}`,
      );
      if (!stored) return;
      const savedDecision = JSON.parse(stored) as {
        decision: string;
        comment: string;
        reasonCategory?: string;
      };
      setDecision(savedDecision.decision);
      setReason(savedDecision.comment);
      setReasonCategory(savedDecision.reasonCategory || 'Другое');
      setSaved(true);
    } catch {
      // Keep the prediction available if browser storage is disabled.
    }
  }, [p.id]);
  useEffect(() => {
    try {
      setClaimedBy(window.localStorage.getItem(`moscollector-claim-${p.id}`) || '');
    } catch {
      setClaimedBy('');
    }
  }, [p.id]);
  const claimPrediction = () => {
    try { window.localStorage.setItem(`moscollector-claim-${p.id}`, dispatcher.name); } catch { /* demo session remains usable */ }
    setClaimedBy(dispatcher.name);
    notify(`Прогноз ${p.id} принят в работу`);
  };
  const readOnly = Boolean(claimedBy && claimedBy !== dispatcher.name);
  const sensorConfig = {
    temp: {
      label: 'Температура',
      current: '87 °C',
      change: '+9 °C',
      threshold: '80 °C',
      color: '#DC2626',
    },
    vibration: {
      label: 'Вибрация',
      current: '5,6 мм/с',
      change: '+1,5 мм/с',
      threshold: '4,5 мм/с',
      color: '#EA580C',
    },
    pressure: {
      label: 'Давление',
      current: '3,7 бар',
      change: '−0,4 бар',
      threshold: '4,0 бар',
      color: '#D97706',
    },
  }[sensor];
  const save = () => {
    if (readOnly) {
      notify(`Прогноз уже обрабатывает ${claimedBy}`);
      return;
    }
    if (!decision) {
      notify('Выберите решение диспетчера');
      return;
    }
    if (!reasonCategory) {
      notify('Выберите основание решения');
      return;
    }
    const dispatcherComment = reason.trim();
    if (decision === 'Ложное срабатывание' && !dispatcherComment) {
      notify('Укажите комментарий для ложного срабатывания');
      return;
    }
    try {
      window.localStorage.setItem(
        `moscollector-decision-${p.id}`,
        JSON.stringify({
          decision,
          comment: dispatcherComment,
          reasonCategory,
          savedAt: new Date().toISOString(),
          dispatcher: dispatcher.name,
        }),
      );
    } catch {
      // The decision remains visible for the current session.
    }
    storeJournalEntry({
      predictionId: p.id,
      date: new Date().toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      object: p.object,
      type: p.type,
      probability: `${p.probability}%`,
      fact: journalFact(decision),
      decision,
      dispatcher: dispatcher.name,
      comment: `${reasonCategory}${dispatcherComment ? ` · ${dispatcherComment}` : ''}`,
      status: journalStatus(decision),
    });
    if (decision === 'Направить бригаду') {
      const sentRequests = loadSentRequests();
      const existingRequest = sentRequests.find(
        (request) => request.sourcePredictionId === p.id,
      );
      if (existingRequest) {
        storeSentRequests(
          sentRequests.map((request) =>
            request.requestId === existingRequest.requestId
              ? { ...request, dispatcherComment }
              : request,
          ),
        );
        setSaved(true);
        notify(`Комментарий в заявке ${existingRequest.requestId} обновлён`);
        return;
      }

      const request: SentRequest = {
        id: p.id,
        sourcePredictionId: p.id,
        risk: p.risk,
        probability: p.probability,
        object: p.object,
        title: `Выезд бригады: ${p.type}`,
        deadline: `В течение ${p.horizon}`,
        requestId: `RQ-${Date.now().toString().slice(-6)}`,
        sentAt: 'Только что',
        status: 'Принята',
        dispatcherComment,
        assignedUnit: 'Аварийно-ремонтная бригада',
        statusHistory: [{ status: 'Принята', at: 'Только что', author: dispatcher.name }],
      };
      storeSentRequests([request, ...sentRequests]);
      setSaved(true);
      notify(`Бригада направлена. Заявка ${request.requestId} принята`);
      return;
    }

    setSaved(true);
    notify('Решение сохранено в журнале');
  };
  return (
    <>
      <button className="back-btn" onClick={() => go('predictions')}>
        <ArrowLeft size={17} /> Все прогнозы
      </button>
      <div className="detail-head">
        <div>
          <div className="detail-kicker">
            <span className={riskClass(p.risk)}>
              <i />
              {p.risk} риск
            </span>
            <span>{p.id}</span>
          </div>
          <h2>{p.type}</h2>
          <p>{p.object} · Нагатинская наб., 18, стр. 2</p>
          <div className="prediction-meta">
            <span>{context.objectId}</span><span>{context.system}</span><span>{context.picket}</span><span>Горизонт {p.horizon}</span>
          </div>
        </div>
        <div className="action-menu-wrap">
          {claimedBy ? (readOnly ? (
            <span className="claim-badge locked"><ShieldCheck size={15} />Обрабатывает {claimedBy}</span>
          ) : (
            <button className="claim-badge" onClick={() => {
              try { window.localStorage.removeItem(`moscollector-claim-${p.id}`); } catch { /* keep current session usable */ }
              setClaimedBy('');
              notify(`Прогноз ${p.id} освобождён`);
            }}><ShieldCheck size={15} />Вы обрабатываете · освободить</button>
          )) : (
            <button className="secondary-btn" onClick={claimPrediction}><Users size={16} />Принять в работу</button>
          )}
          <button
            className="icon-btn"
            onClick={() => setMenu(!menu)}
            aria-label="Действия с прогнозом"
          >
            <MoreHorizontal size={20} />
          </button>
          {menu && (
            <div className="action-menu">
              <button
                onClick={() => {
                  downloadFile(
                    `${p.id}.txt`,
                    `${p.id}\n${p.object}\n${p.type}\nВероятность: ${p.probability}%`,
                  );
                  setMenu(false);
                  notify('Карточка прогноза выгружена');
                }}
              >
                <Download size={15} />
                Скачать карточку
              </button>
              <button onClick={() => go('equipment', 'EQ-1034')}>
                <Factory size={15} />
                Открыть оборудование
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <section className="panel sensor-panel">
            <PanelHead
              title="Показания датчиков"
              subtitle="Последние 12 часов"
            />
            <div className="sensor-tabs">
              {(
                [
                  ['temp', 'Температура'],
                  ['vibration', 'Вибрация'],
                  ['pressure', 'Давление'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={sensor === key ? 'active' : ''}
                  onClick={() => setSensor(key)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="sensor-summary">
              <div>
                <Thermometer size={19} />
                <span>
                  Текущее значение<strong>{sensorConfig.current}</strong>
                </span>
              </div>
              <div>
                <TrendingUp size={19} />
                <span>
                  Изменение за 2 ч
                  <strong style={{ color: sensorConfig.color }}>
                    {sensorConfig.change}
                  </strong>
                </span>
              </div>
              <div>
                <Gauge size={19} />
                <span>
                  Порог тревоги<strong>{sensorConfig.threshold}</strong>
                </span>
              </div>
            </div>
            <div className="sensor-chart">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 260 }}>
                <AreaChart data={sensorData}>
                  <defs>
                    <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="0"
                        stopColor={sensorConfig.color}
                        stopOpacity={0.18}
                      />
                      <stop
                        offset="1"
                        stopColor={sensorConfig.color}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eeedf3" />
                  <XAxis dataKey="t" axisLine={false} tickLine={false} />
                  <YAxis
                    domain={['auto', 'auto']}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey={sensor}
                    stroke={sensorConfig.color}
                    strokeWidth={2.5}
                    fill="url(#tempFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel explain-panel">
            <PanelHead title="Почему сформирован прогноз" subtitle="Факторы показаны для проверки диспетчером" />
            <div className="explain-summary">
              <div><span>Вероятность</span><strong>{p.probability}%</strong></div>
              <div><span>Источники</span><strong>{context.sources.join(' · ')}</strong></div>
              <div><span>Расчёт</span><strong>{context.modelVersion}</strong></div>
            </div>
            <div className="factor-list">
              {context.factors.map((factor) => (
                <div className="factor-row" key={factor.label}>
                  <div className="factor-copy"><strong>{factor.label}</strong><small>{factor.note}</small></div>
                  <span>{factor.value}</span>
                  <div className="factor-impact"><i style={{ width: `${factor.impact}%` }} /><b>{factor.impact}%</b></div>
                </div>
              ))}
            </div>
            <div className="historical-note"><ShieldCheck size={18} /><span><strong>Историческое сопоставление</strong>{context.historicalMatch}</span></div>
          </section>
          <section className="panel signal-chain-panel">
            <PanelHead title="Связанные сигналы" subtitle="Один прогноз объединяет последовательность событий" />
            <div className="signal-chain">
              {context.relatedSignals.map((signal, index) => (
                <div key={`${signal.channel}-${signal.time}`}>
                  <span className="signal-order">{index + 1}</span>
                  <span><strong>{signal.event}</strong><small>{signal.time} · {signal.channel}</small></span>
                  <b>{signal.state}</b>
                </div>
              ))}
            </div>
          </section>
          <section className="panel">
            <PanelHead
              title="Решение диспетчера"
              subtitle="Выберите действие и укажите основание"
            />
            <div className="decision-grid">
              {[
                ['Направить бригаду', Send],
                ['Продолжить мониторинг', Activity],
                ['Ложное срабатывание', X],
                ['Передать ответственному', Users],
                ['Закрыть после проверки', Check],
              ].map(([x, I]: any) => (
                <button
                  key={x}
                  disabled={readOnly}
                  className={decision === x ? 'active' : ''}
                  onClick={() => {
                    setDecision(x);
                    setSaved(false);
                  }}
                >
                  <I size={18} />
                  <span>{x}</span>
                  {decision === x && <Check size={16} />}
                </button>
              ))}
            </div>
            <select
              disabled={readOnly}
              className="decision-reason-select"
              value={reasonCategory}
              onChange={(event) => { setReasonCategory(event.target.value); setSaved(false); }}
              aria-label="Основание решения"
            >
              <option value="">Выберите основание решения</option>
              <option>Подтверждено связанными датчиками</option>
              <option>Требуется визуальная проверка</option>
              <option>Проверено по камере</option>
              <option>Неисправность датчика или линии</option>
              <option>Плановые работы на объекте</option>
              <option>Другое</option>
            </select>
            <textarea
              disabled={readOnly}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setSaved(false);
              }}
              placeholder="Основание решения (обязательно при ложном срабатывании)"
            />
            <div className="decision-footer">
              <p>
                <ShieldCheck size={17} /> Рекомендация сформирована системой.
                Окончательное решение принимает диспетчер.
              </p>
              <button className="primary-btn" onClick={save} disabled={readOnly}>
                {saved ? (
                  <>
                    <Check size={16} /> Сохранено
                  </>
                ) : (
                  <>Сохранить решение</>
                )}
              </button>
            </div>
            {saved && (
              <div className="saved-decision">
                <span>Сохранённое решение</span>
                <strong>{decision}</strong>
                <p>
                  <b>Комментарий диспетчера:</b>{' '}
                  {reason.trim() || 'Комментарий не указан'}
                </p>
                <p><b>Основание:</b> {reasonCategory}</p>
              </div>
            )}
          </section>
        </div>
        <aside className="detail-side">
          <section className="panel recommendation">
            <span className="rec-icon">
              <Sparkles size={20} />
            </span>
            <p className="eyebrow">Рекомендация системы</p>
            <h3>Направить аварийную бригаду</h3>
            <p>
              Провести диагностику подшипникового узла насоса №3 и подготовить
              резервный агрегат к переключению.
            </p>
            <ul>
              <li>Снизить нагрузку до 70%</li>
              <li>Проверить систему смазки</li>
              <li>Контролировать каждые 15 минут</li>
            </ul>
          </section>
          <section className="panel object-brief">
            <PanelHead title="Объект" />
            <div className="object-symbol">
              <Factory size={23} />
            </div>
            <h3>КНС «Нагатинская»</h3>
            <p>Насос №3 · EQ-1034</p>
            <dl>
              <div>
                <dt>Введён в эксплуатацию</dt>
                <dd>2018</dd>
              </div>
              <div>
                <dt>Последнее ТО</dt>
                <dd>12.08.2026</dd>
              </div>
              <div>
                <dt>Наработка</dt>
                <dd>18 420 ч</dd>
              </div>
            </dl>
            <button
              className="secondary-btn full"
              onClick={() => go('equipment', 'EQ-1034')}
            >
              Карточка оборудования
            </button>
          </section>
        </aside>
      </div>
    </>
  );
}
function Incidents({ notify }: { notify: (s: string) => void }) {
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

function EquipmentPage({
  go,
  notify,
}: {
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState('Все состояния');
  const [importInfo, setImportInfo] = useState('');
  const visibleEquipment = equipment.filter(
    (item) =>
      (state === 'Все состояния' || item.state === state) &&
      `${item.id} ${item.object} ${item.type}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const exportEquipment = () => {
    const csv = [
      'ID;Объект;Тип;Состояние;Значение;Риск;Последнее ТО;Следующее ТО',
      ...equipment.map(
        (e) =>
          `${e.id};${e.object};${e.type};${e.state};${e.value};${e.risk}%;${e.last};${e.next}`,
      ),
    ].join('\n');
    downloadFile('equipment.csv', `\uFEFF${csv}`, 'text/csv;charset=utf-8');
    notify('Реестр оборудования выгружен');
  };
  const importRegistry = (file?: File) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx'].includes(extension || '')) {
      notify('Поддерживаются только CSV и XLSX');
      return;
    }
    if (extension === 'csv') {
      const reader = new FileReader();
      reader.onload = () => {
        const count = String(reader.result || '').split(/\r?\n/).filter(Boolean).length - 1;
        setImportInfo(`${file.name} · найдено записей: ${Math.max(0, count)} · ожидает подтверждения`);
        notify('CSV проверен и подготовлен к импорту');
      };
      reader.readAsText(file);
    } else {
      setImportInfo(`${file.name} · XLSX принят · обработка будет выполнена серверным импортёром`);
      notify('XLSX подготовлен к передаче в API импорта');
    }
  };
  return (
    <>
      <PageHead
        title="Оборудование"
        subtitle="12 472 единицы на 1 247 объектах"
        action={<div className="inline-actions">
          <label className="secondary-btn file-btn"><input type="file" accept=".csv,.xlsx" onChange={(event) => importRegistry(event.target.files?.[0])} />Импорт CSV/XLSX</label>
          <button className="secondary-btn" onClick={exportEquipment}><Download size={16} /> Экспорт реестра</button>
        </div>}
      />
      {importInfo && <div className="import-status"><Activity size={17} /><span><strong>Проверка файла завершена</strong>{importInfo}</span><button onClick={() => setImportInfo('')}>Закрыть</button></div>}
      <div className="metric-grid four">
        <Metric
          icon={ShieldCheck}
          label="Исправно"
          value="12 074"
          note="96,8% реестра"
          tone="green"
          trend="+18 за месяц"
        />
        <Metric
          icon={AlertTriangle}
          label="Требует внимания"
          value="301"
          note="2,4% реестра"
          tone="yellow"
          trend="−12 за неделю"
        />
        <Metric
          icon={Siren}
          label="Критическое"
          value="97"
          note="0,8% реестра"
          tone="red"
          trend="+3 сегодня"
        />
        <Metric
          icon={CalendarClock}
          label="ТО на 7 дней"
          value="64"
          note="18 приоритетных"
          tone="purple"
          trend="По графику"
        />
      </div>
      <div className="panel table-panel">
        <div className="table-tools">
          <label className="search-field">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ID, объект или тип оборудования"
            />
          </label>
          <select
            className="select-btn"
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label="Состояние оборудования"
          >
            <option>Все состояния</option>
            <option>Требует внимания</option>
            <option>Нестабильно</option>
            <option>Работает</option>
            <option>Исправно</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {[
                  'ID / объект',
                  'Тип',
                  'Состояние',
                  'Последнее значение',
                  'Риск отказа',
                  'Последнее ТО',
                  'Следующее ТО',
                  '',
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleEquipment.map((e) => (
                <tr key={e.id} onClick={() => go('equipment', e.id)}>
                  <td>
                    <strong>{e.id}</strong>
                    <small>{e.object}</small>
                  </td>
                  <td>{e.type}</td>
                  <td>
                    <span className="status-badge">{e.state}</span>
                  </td>
                  <td>
                    <strong>{e.value}</strong>
                  </td>
                  <td>
                    <span className={riskClass(riskFromNumber(e.risk))}>
                      <i />
                      {e.risk}%
                    </span>
                  </td>
                  <td>{e.last}</td>
                  <td>{e.next}</td>
                  <td>
                    <ChevronRight size={17} />
                  </td>
                </tr>
              ))}
              {visibleEquipment.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty-cell">
                    Оборудование не найдено
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

function EquipmentDetail({
  id,
  go,
  notify,
}: {
  id: string;
  go: (s: Section, id?: string) => void;
  notify: (s: string) => void;
}) {
  return (
    <>
      <button className="back-btn" onClick={() => go('equipment')}>
        <ArrowLeft size={17} /> Всё оборудование
      </button>
      <div className="detail-head">
        <div>
          <div className="detail-kicker">
            <span className="risk risk-критический">
              <i />
              Требует внимания
            </span>
            <span>{id}</span>
          </div>
          <h2>Насос Grundfos CR 95 — №3</h2>
          <p>КНС «Нагатинская» · Основной насосный зал</p>
        </div>
        <button
          className="primary-btn"
          onClick={() => {
            notify('Работа добавлена в список заявок');
            go('maintenance');
          }}
        >
          <Wrench size={16} /> Запланировать ТО
        </button>
      </div>
      <div className="metric-grid four">
        <Metric
          icon={Thermometer}
          label="Температура"
          value="87 °C"
          note="Порог 80 °C"
          tone="red"
          trend="+9 °C за 2 ч"
        />
        <Metric
          icon={Activity}
          label="Вибрация"
          value="5,6 мм/с"
          note="Порог 4,5 мм/с"
          tone="orange"
          trend="+18%"
        />
        <Metric
          icon={Gauge}
          label="Давление"
          value="3,7 бар"
          note="Норма 4,2–5,1"
          tone="yellow"
          trend="−0,5 бар"
        />
        <Metric
          icon={CircleGauge}
          label="Риск отказа"
          value="94%"
          note="Горизонт 6 часов"
          tone="red"
          trend="Критический"
        />
      </div>
      <div className="dashboard-grid">
        <section className="panel chart-panel">
          <PanelHead
            title="История показаний"
            subtitle="Температура · последние 12 часов"
          />
          <div className="chart-wrap large-chart">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 280 }}>
              <LineChart data={sensorData}>
                <CartesianGrid vertical={false} stroke="#eeedf3" />
                <XAxis dataKey="t" axisLine={false} />
                <YAxis domain={[50, 95]} axisLine={false} />
                <Tooltip />
                <Line
                  dataKey="temp"
                  stroke="#6246D9"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <PanelHead title="Аномалии" subtitle="За последние 30 дней" />
          <div className="timeline">
            <TimelineItem
              date="Сегодня, 09:42"
              title="Температура выше порога"
              text="87 °C при пороге 80 °C"
              tone="red"
            />
            <TimelineItem
              date="Сегодня, 08:16"
              title="Рост вибрации"
              text="Увеличение на 18% за 90 минут"
              tone="orange"
            />
            <TimelineItem
              date="12 сентября"
              title="Кратковременный скачок"
              text="Автоматически нормализован"
              tone="yellow"
            />
          </div>
        </section>
        <section className="panel latest-panel">
          <PanelHead
            title="История обслуживания"
            subtitle="Последние работы по оборудованию"
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Работа</th>
                  <th>Исполнитель</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>12.08.2026</td>
                  <td>Плановое ТО</td>
                  <td>Бригада №14</td>
                  <td>
                    <span className="status-badge">Выполнено</span>
                  </td>
                </tr>
                <tr>
                  <td>18.05.2026</td>
                  <td>Замена уплотнений</td>
                  <td>АО «Мосводоканал»</td>
                  <td>
                    <span className="status-badge">Выполнено</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
function TimelineItem({
  date,
  title,
  text,
  tone,
}: {
  date: string;
  title: string;
  text: string;
  tone: string;
}) {
  return (
    <div className="timeline-item">
      <i className={tone} />
      <span>
        <small>{date}</small>
        <strong>{title}</strong>
        <p>{text}</p>
      </span>
    </div>
  );
}

function Maintenance({ notify, user }: { notify: (s: string) => void; user: UserAccount }) {
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
      />
      <div className={`maintenance-board${isTechnician ? ' technician-board' : ''}`}>
        {!isTechnician && (
        <section className="maintenance-column">
          <div className="column-head">
            <div>
              <h3>Предлагаемые заявки</h3>
              <p>Сформированы на основе прогнозов</p>
            </div>
            <span>{proposals.length}</span>
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
            <span>{sent.length}</span>
          </div>
          <div className="maintenance-cards">
            {sent.map((job) => (
              <article className="job-card" key={job.requestId}>
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
              <article className="archive-row" key={`${request.requestId}-${request.archivedAt}`}>
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

function Analytics({ notify }: { notify: (s: string) => void }) {
  const [period, setPeriod] = useState('6 месяцев');
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
        subtitle={`Выбранный период: ${period}`}
        action={
          <div className="inline-actions">
            <select
              className="select-btn"
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                notify(`Период изменён: ${e.target.value}`);
              }}
              aria-label="Период аналитики"
            >
              <option>30 дней</option>
              <option>3 месяца</option>
              <option>6 месяцев</option>
              <option>12 месяцев</option>
            </select>
            <button
              className="secondary-btn"
              onClick={() => {
                downloadFile(
                  'analytics-report.csv',
                  '\uFEFFПоказатель;Значение\nПрогнозы;28641\nPrecision;91,2%\nRecall;86,4%\nСреднее время реакции;18 мин',
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
      <div className="metric-grid four">
        <Metric
          icon={Sparkles}
          label="Всего прогнозов"
          value="28 641"
          note="за выбранный период"
          tone="purple"
          trend="+12,4%"
        />
        <Metric
          icon={CircleGauge}
          label="Precision"
          value="91,2%"
          note="целевое ≥ 88%"
          tone="green"
          trend="+2,8 п.п."
        />
        <Metric
          icon={Activity}
          label="Recall"
          value="86,4%"
          note="целевое ≥ 84%"
          tone="green"
          trend="+3,1 п.п."
        />
        <Metric
          icon={Clock3}
          label="Среднее время реакции"
          value="18 мин"
          note="целевое ≤ 25 мин"
          tone="purple"
          trend="−4 мин"
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
              <LineChart data={analyticsMonths}>
                <CartesianGrid vertical={false} stroke="#eeedf3" />
                <XAxis dataKey="m" axisLine={false} />
                <YAxis domain={[65, 100]} axisLine={false} />
                <Tooltip />
                <Line dataKey="precision" stroke="#6246D9" strokeWidth={2.5} />
                <Line dataKey="recall" stroke="#EA580C" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel">
          <PanelHead
            title="Распределение рисков"
            subtitle="Доля от всех прогнозов"
          />
          <div className="donut-wrap">
            <ResponsiveContainer width="100%" height={210} minWidth={0} initialDimension={{ width: 420, height: 210 }}>
              <PieChart>
                <Pie
                  data={riskData}
                  dataKey="value"
                  innerRadius={62}
                  outerRadius={87}
                  paddingAngle={3}
                >
                  {riskData.map((x) => (
                    <Cell key={x.name} fill={x.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center">
              <strong>28 641</strong>
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
            subtitle="Исходы по решениям диспетчеров"
          />
          <div className="efficiency">
            <div>
              <span>Направлена бригада</span>
              <strong>89%</strong>
              <i>
                <b style={{ width: '89%' }} />
              </i>
              <small>инцидентов предотвращено</small>
            </div>
            <div>
              <span>Продолжен мониторинг</span>
              <strong>76%</strong>
              <i>
                <b style={{ width: '76%' }} />
              </i>
              <small>верных решений</small>
            </div>
            <div>
              <span>Создана заявка</span>
              <strong>93%</strong>
              <i>
                <b style={{ width: '93%' }} />
              </i>
              <small>выполнено в срок</small>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function AdminPanel({
  user,
  darkTheme,
  onToggleTheme,
  onLogout,
}: {
  user: UserAccount;
  darkTheme: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('dispatcher');
  const [unit, setUnit] = useState('Центральная ОДС');
  const [district, setDistrict] = useState('Все округа');
  const [active, setActive] = useState(true);
  const [message, setMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [claimLock, setClaimLock] = useState(true);
  const [criticalNotifications, setCriticalNotifications] = useState(true);

  useEffect(() => {
    setAccounts(loadDispatcherAccounts());
    try {
      const stored = window.localStorage.getItem('moscollector-ui-settings');
      if (stored) {
        const settings = JSON.parse(stored) as { refreshInterval?: string; claimLock?: boolean; criticalNotifications?: boolean };
        if (settings.refreshInterval) setRefreshInterval(settings.refreshInterval);
        if (typeof settings.claimLock === 'boolean') setClaimLock(settings.claimLock);
        if (typeof settings.criticalNotifications === 'boolean') setCriticalNotifications(settings.criticalNotifications);
      }
    } catch {
      // Keep default demo settings when browser storage is unavailable.
    }
  }, []);

  const saveAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (
      normalizedEmail === managerAccount.email ||
      accounts.some(
        (account) =>
          account.id !== editingId &&
          account.email.toLowerCase() === normalizedEmail,
      )
    ) {
      setMessage('Аккаунт с такой почтой уже существует');
      return;
    }
    const account: UserAccount = {
      id: editingId || `user-${Date.now()}`,
      name: name.trim(),
      email: normalizedEmail,
      password,
      role,
      unit: unit.trim(),
      district,
      active,
    };
    const next = editingId
      ? accounts.map((item) => (item.id === editingId ? account : item))
      : [account, ...accounts];
    setAccounts(next);
    storeDispatcherAccounts(next);
    setName('');
    setEmail('');
    setPassword('');
    setRole('dispatcher');
    setUnit('Центральная ОДС');
    setDistrict('Все округа');
    setActive(true);
    setEditingId(null);
    setMessage(
      editingId
        ? `Данные аккаунта ${account.name} обновлены`
        : `Аккаунт ${account.name} создан`,
    );
  };

  const editAccount = (account: UserAccount) => {
    setEditingId(account.id);
    setName(account.name);
    setEmail(account.email);
    setPassword(account.password);
    setRole(account.role);
    setUnit(account.unit);
    setDistrict(account.district);
    setActive(account.active);
    setMessage(`Редактирование аккаунта ${account.name}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('dispatcher');
    setUnit('Центральная ОДС');
    setDistrict('Все округа');
    setActive(true);
    setMessage('Редактирование отменено');
  };

  const deleteAccount = (account: UserAccount) => {
    if (!window.confirm(`Удалить аккаунт «${account.name}»?`)) return;
    const next = accounts.filter((item) => item.id !== account.id);
    setAccounts(next);
    storeDispatcherAccounts(next);
    if (editingId === account.id) {
      setEditingId(null);
      setName('');
      setEmail('');
      setPassword('');
    }
    setMessage(`Аккаунт ${account.name} удалён`);
  };

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <div className="brand-mark">
            <Building2 size={19} />
          </div>
          <div>
            <strong>МосКоллектор</strong>
            <span>Панель руководителя</span>
          </div>
        </div>
        <div className="admin-profile">
          <ThemeToggle darkTheme={darkTheme} onToggle={onToggleTheme} />
          <span>
            <strong>{user.name}</strong>
            <small>{roleLabels[user.role]}</small>
          </span>
          <button className="secondary-btn" onClick={onLogout}>
            <LogOut size={16} /> Выйти
          </button>
        </div>
      </header>
      <main className="admin-content">
        <PageHead
          title="Пользователи и доступ"
          subtitle="Роли, подразделения и области ответственности"
        />
        {message && <div className="admin-message">{message}</div>}
        <div className="admin-grid">
          <form className="panel admin-form" onSubmit={saveAccount}>
            <div className="admin-section-head">
              <span className="metric-icon purple">
                <UserPlus size={20} />
              </span>
              <div>
                <h3>{editingId ? 'Редактирование' : 'Новый пользователь'}</h3>
                <p>
                  {editingId
                    ? 'Измените данные учётной записи'
                    : 'Укажите данные для входа сотрудника'}
                </p>
              </div>
            </div>
            <label>
              <span>Имя и фамилия</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Например, Иван Орлов"
                required
              />
            </label>
            <label>
              <span>Роль</span>
              <select value={role} onChange={(event) => setRole(event.target.value as UserRole)}>
                <option value="dispatcher">Диспетчер ОДС или эксплуатационного подразделения</option>
                <option value="technician">Технический персонал по обслуживанию коллекторов</option>
                <option value="manager">Руководитель эксплуатационного подразделения</option>
              </select>
            </label>
            <label>
              <span>Подразделение</span>
              <input value={unit} onChange={(event) => setUnit(event.target.value)} required />
            </label>
            <label>
              <span>Область доступа</span>
              <select value={district} onChange={(event) => setDistrict(event.target.value)}>
                <option>Все округа</option><option>ЦАО</option><option>ЮАО</option><option>СВАО</option><option>ЮВАО</option><option>ЗАО</option>
              </select>
            </label>
            <label className="admin-active-check">
              <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
              <span>Учётная запись активна</span>
            </label>
            <label>
              <span>Рабочая почта</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="dispatcher@moscollector.ru"
                required
              />
            </label>
            <label>
              <span>Пароль</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                placeholder="Минимум 6 символов"
                required
              />
            </label>
            <div className="admin-form-actions">
              {editingId && (
                <button
                  className="secondary-btn"
                  type="button"
                  onClick={cancelEditing}
                >
                  Отмена
                </button>
              )}
              <button className="primary-btn" type="submit">
                {editingId ? <Check size={16} /> : <UserPlus size={16} />}
                {editingId ? 'Сохранить изменения' : 'Создать аккаунт'}
              </button>
            </div>
          </form>
          <section className="panel admin-list">
            <div className="admin-section-head">
              <span className="metric-icon purple">
                <Users size={20} />
              </span>
              <div>
                <h3>Пользователи</h3>
                <p>Активных аккаунтов: {accounts.filter((account) => account.active).length} из {accounts.length}</p>
              </div>
            </div>
            <div className="account-list">
              {accounts.map((account) => (
                <article key={account.id}>
                  <span className="avatar">
                    {account.name
                      .split(' ')
                      .map((part) => part[0])
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <span className="account-copy">
                    <strong>{account.name}</strong>
                    <small>{account.email} · {account.unit}</small>
                  </span>
                  <span className={`status-badge ${account.active ? 'status-success' : 'status-neutral'}`}>
                    {account.active ? roleLabels[account.role] : 'Заблокирован'}
                  </span>
                  <button
                    className="edit-account"
                    onClick={() => editAccount(account)}
                    aria-label={`Редактировать аккаунт ${account.name}`}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="delete-account"
                    onClick={() => deleteAccount(account)}
                    aria-label={`Удалить аккаунт ${account.name}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              ))}
              {accounts.length === 0 && (
                <div className="column-empty">
                  <Users size={22} />
                  <strong>Нет пользовательских аккаунтов</strong>
                </div>
              )}
            </div>
          </section>
        </div>
        <div className="admin-config-grid">
          <section className="panel admin-config-card">
            <div className="admin-section-head">
              <span className="metric-icon green"><Activity size={20} /></span>
              <div><h3>Интеграции</h3><p>Состояние демонстрационного контура</p></div>
            </div>
            <div className="integration-list">
              <div><span><i className="source-ok" />СМВУ</span><b>Демо-поток · read-only</b></div>
              <div><span><i className="source-ok" />Реестр оборудования</span><b>Синхронизирован</b></div>
              <div><span><i className="source-mock" />Журнал ОДС</span><b>Имитатор REST API</b></div>
              <div><span><i className="source-mock" />Система заявок</span><b>Имитатор REST API</b></div>
              <div><span><i className="source-wait" />ML API</span><b>Ожидает подключения</b></div>
            </div>
          </section>
          <section className="panel admin-config-card">
            <div className="admin-section-head">
              <span className="metric-icon purple"><SlidersHorizontal size={20} /></span>
              <div><h3>Рабочие параметры</h3><p>Настройки диспетчерского интерфейса</p></div>
            </div>
            <label><span>Обновление телеметрии</span><select value={refreshInterval} onChange={(event) => setRefreshInterval(event.target.value)}><option value="1">Каждую минуту</option><option value="5">Каждые 5 минут</option><option value="15">Каждые 15 минут</option><option value="manual">Вручную</option></select></label>
            <label className="settings-check"><input type="checkbox" checked={claimLock} onChange={(event) => setClaimLock(event.target.checked)} /><span><strong>Блокировка обработки</strong><small>После принятия инцидента остальные пользователи видят его только для чтения</small></span></label>
            <label className="settings-check"><input type="checkbox" checked={criticalNotifications} onChange={(event) => setCriticalNotifications(event.target.checked)} /><span><strong>Критические уведомления</strong><small>Показывать уведомления внутри приложения</small></span></label>
            <button className="primary-btn" onClick={() => {
              window.localStorage.setItem('moscollector-ui-settings', JSON.stringify({ refreshInterval, claimLock, criticalNotifications }));
              setMessage('Рабочие параметры сохранены');
            }}><Check size={16} />Сохранить параметры</button>
          </section>
          <section className="panel admin-config-card audit-card">
            <div className="admin-section-head">
              <span className="metric-icon yellow"><ShieldCheck size={20} /></span>
              <div><h3>Аудит действий</h3><p>Последние события демонстрационного стенда</p></div>
            </div>
            <div className="audit-list">
              <p><strong>Вход руководителя</strong><span>Только что · {user.name}</span></p>
              <p><strong>Синхронизация реестра</strong><span>12 минут назад · системное событие</span></p>
              <p><strong>Изменён статус заявки RQ-1086</strong><span>Сегодня, 08:05 · Бригада №7</span></p>
              <p><strong>Создано решение по PR-2491</strong><span>Сегодня, 07:48 · диспетчер ОДС</span></p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

function Login({
  darkTheme,
  onToggleTheme,
  onLogin,
}: {
  darkTheme: boolean;
  onToggleTheme: () => void;
  onLogin: (user: UserAccount) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [help, setHelp] = useState(false);
  const [email, setEmail] = useState('dispatcher@moscollector.ru');
  const [password, setPassword] = useState('monitoring2026');
  const [error, setError] = useState('');
  return (
    <div className="login-page">
      <div className="login-theme-toggle">
        <ThemeToggle darkTheme={darkTheme} onToggle={onToggleTheme} />
      </div>
      <div className="login-aside">
        <div className="brand login-brand">
          <div className="brand-mark">
            <Building2 size={20} />
          </div>
          <div>
            <strong>МосКоллектор</strong>
            <span>Правительство Москвы</span>
          </div>
        </div>
        <div>
          <span className="login-tag">
            <ShieldCheck size={16} /> Единый контур мониторинга
          </span>
          <h1>
            Инфраструктура под контролем.
            <br />
            Решения — за человеком.
          </h1>
          <p>
            Прогнозирование рисков и поддержка диспетчерских решений на объектах
            городской инженерной инфраструктуры.
          </p>
        </div>
        <div className="login-stats">
          <div>
            <strong>1 247</strong>
            <span>объектов онлайн</span>
          </div>
          <div>
            <strong>12 472</strong>
            <span>единицы оборудования</span>
          </div>
        </div>
      </div>
      <main className="login-main">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setError('');
            window.setTimeout(() => {
              const account = [managerAccount, ...loadDispatcherAccounts()].find(
                (item) =>
                  item.email.toLowerCase() === email.trim().toLowerCase() &&
                  item.password === password,
              );
              setLoading(false);
              if (account?.active) onLogin(account);
              else if (account && !account.active) setError('Учётная запись заблокирована руководителем подразделения');
              else setError('Неверная почта или пароль');
            }, 450);
          }}
        >
          <div className="login-mobile-brand">
            <div className="brand-mark">
              <Building2 size={19} />
            </div>
            <strong>МосКоллектор</strong>
          </div>
          <p className="eyebrow">Защищённый доступ</p>
          <h2>Вход в систему</h2>
          <p>Используйте корпоративную учётную запись. На GitHub Pages работает демонстрационный контур.</p>
          <label>
            <span>Рабочая почта</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <div className="login-options">
            <label>
              <input type="checkbox" defaultChecked />
              Запомнить меня
            </label>
            <button type="button" onClick={() => setHelp(!help)}>
              Забыли пароль?
            </button>
          </div>
          {help && (
            <div className="login-message">
              Для восстановления доступа обратитесь к руководителю подразделения: доб.
              1420.
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <div className="demo-login-list">
            <span>Демо-роли</span>
            {[
              ['Диспетчер', defaultDispatcherAccounts[0]],
              ['Технический персонал', defaultDispatcherAccounts[2]],
              ['Руководитель', managerAccount],
            ].map(([label, account]) => (
              <button key={(account as UserAccount).id} type="button" onClick={() => {
                setEmail((account as UserAccount).email);
                setPassword((account as UserAccount).password);
                setError('');
              }}>{label as string}</button>
            ))}
          </div>
          <button className="primary-btn login-submit" disabled={loading}>
            {loading ? 'Проверяем данные…' : 'Войти в систему'}
            <ChevronRight size={17} />
          </button>
          <div className="login-help">
            <ShieldCheck size={17} />
            <span>
              Доступ разрешён только сотрудникам, подключённым к защищённому
              контуру.
            </span>
          </div>
        </form>
      </main>
    </div>
  );
}
