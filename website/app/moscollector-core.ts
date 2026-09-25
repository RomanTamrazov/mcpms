'use client';
import type { MapObject } from './interactive-map';
import { type Section } from '@/lib/app-routes';
import { type EquipmentImportRow } from '@/lib/equipment-import';
import { BarChart3, CalendarDays, Factory, LayoutDashboard, Map, Siren, Sparkles, Wrench } from 'lucide-react';


export type Risk = 'Критический' | 'Высокий' | 'Средний' | 'Низкий';


export type UserRole = 'dispatcher' | 'technician' | 'manager';



export type UserAccount = {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  unit: string;
  district: string;
  active: boolean;
};



export const roleLabels: Record<UserRole, string> = {
  dispatcher: 'Диспетчер ОДС или эксплуатационного подразделения',
  technician: 'Технический персонал по обслуживанию коллекторов',
  manager: 'Руководитель эксплуатационного подразделения',
};



export const managerAccount: UserAccount = {
  id: 'admin',
  name: 'Руководитель подразделения',
  email: 'admin@moscollector.ru',
  password: 'admin2026',
  role: 'manager',
  unit: 'Эксплуатационное подразделение',
  district: 'Все округа',
  active: true,
};



export const defaultDispatcherAccounts: UserAccount[] = [
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



export const accountsStorageKey = 'moscollector-dispatcher-accounts';


export const accountsStorageVersionKey = 'moscollector-accounts-version';


export const sessionStorageKey = 'moscollector-current-user';


export const themeStorageKey = 'moscollector-theme';


export const readNotificationsStorageKey = 'moscollector-read-notifications';


export const deploymentBasePath = process.env.NEXT_PUBLIC_BASE_PATH || '';



export function deploymentPath(path: string) {
  return `${deploymentBasePath}${path}`;
}



export function loadDispatcherAccounts() {
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



export function storeDispatcherAccounts(accounts: UserAccount[]) {
  try {
    window.localStorage.setItem(accountsStorageKey, JSON.stringify(accounts));
    window.localStorage.setItem(accountsStorageVersionKey, '4');
  } catch {
    // Keep account management usable for the current session.
  }
}



// Demo RBAC is browser-local. Production access requires a backend identity provider (LDAP/AD).
export function storeCurrentUser(user: UserAccount | null) {
  try {
    if (user) window.localStorage.setItem(sessionStorageKey, user.id);
    else window.localStorage.removeItem(sessionStorageKey);
  } catch {
    // Keep sign-in usable for the current session.
  }
}



export function loadCurrentUser() {
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



export const nav: { id: Section; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Обзор', icon: LayoutDashboard },
  { id: 'map', label: 'Карта объектов', icon: Map },
  { id: 'predictions', label: 'Прогнозы', icon: Sparkles },
  { id: 'incidents', label: 'Журнал', icon: Siren },
  { id: 'equipment', label: 'Оборудование', icon: Factory },
  { id: 'maintenance', label: 'Заявки', icon: Wrench },
  { id: 'schedule', label: 'Графики ППР и ТО', icon: CalendarDays },
  { id: 'analytics', label: 'Аналитика', icon: BarChart3 },
];



export const roleSections: Record<Exclude<UserRole, 'manager'>, Section[]> = {
  dispatcher: ['dashboard', 'map', 'predictions', 'incidents', 'equipment', 'maintenance', 'schedule', 'analytics'],
  technician: ['dashboard', 'map', 'equipment', 'maintenance', 'schedule'],
};



export type PredictionRecord = {
  id: string;
  object: string;
  district: string;
  type: string;
  probability: number;
  risk: Risk;
  horizon: string;
  time: string;
  status: string;
  scoreKind?: string;
  targetNote?: string;
  autoIncidentConfirmation?: boolean;
};



export type MlConnectionState = 'loading' | 'online' | 'degraded' | 'offline' | 'unconfigured';



export const predictions: PredictionRecord[] = [
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



export const maintenanceJobs = [
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



export type SentRequest = (typeof maintenanceJobs)[number] & {
  requestId: string;
  sentAt: string;
  status: string;
  sourcePredictionId?: string;
  dispatcherComment?: string;
  assignedUnit?: string;
  result?: string;
  statusHistory?: { status: string; at: string; author: string }[];
};



export type ArchivedRequest = SentRequest & {
  archivedAt: string;
  technicianResponse: string;
  closedBy: string;
};



export const sentRequestsStorageKey = 'moscollector-sent-requests';


export const archivedRequestsStorageKey = 'moscollector-archived-requests';


export const initialSentRequests: SentRequest[] = [
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



export function loadSentRequests() {
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



export function storeSentRequests(requests: SentRequest[]) {
  try {
    window.localStorage.setItem(
      sentRequestsStorageKey,
      JSON.stringify(requests),
    );
  } catch {
    // Keep the interaction usable even when browser storage is disabled.
  }
}



export function loadArchivedRequests() {
  try {
    const saved = window.localStorage.getItem(archivedRequestsStorageKey);
    return saved ? (JSON.parse(saved) as ArchivedRequest[]) : [];
  } catch {
    return [];
  }
}



export function storeArchivedRequests(requests: ArchivedRequest[]) {
  try {
    window.localStorage.setItem(
      archivedRequestsStorageKey,
      JSON.stringify(requests),
    );
  } catch {
    // Keep the active workflow usable when browser storage is disabled.
  }
}



export type JournalEntry = {
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



export const journalStorageKey = 'moscollector-journal';



export function journalStatus(decision: string) {
  if (decision === 'Направить бригаду') return 'В работе';
  if (decision === 'Продолжить мониторинг') return 'Наблюдение';
  if (decision === 'Передать ответственному') return 'Передан';
  return 'Закрыт';
}



export function journalFact(decision: string) {
  if (decision === 'Направить бригаду') return 'Ожидается';
  if (decision === 'Продолжить мониторинг') return 'Не наступил';
  if (decision === 'Передать ответственному') return 'На проверке';
  if (decision === 'Закрыть после проверки') return 'Проверен';
  return 'Не подтверждён';
}



export function journalStatusClass(status: string) {
  if (status === 'Закрыт') return 'status-success';
  if (status === 'В работе') return 'status-warning';
  if (status === 'Наблюдение') return 'status-monitoring';
  return 'status-neutral';
}



export function loadJournalEntries() {
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



export function storeJournalEntry(entry: JournalEntry) {
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



export const equipment = [
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



export const importedEquipmentStorageKey = 'moscollector-imported-equipment';



export function loadImportedEquipment(): EquipmentImportRow[] {
  try {
    const saved = window.localStorage.getItem(importedEquipmentStorageKey);
    return saved ? JSON.parse(saved) as EquipmentImportRow[] : [];
  } catch { return []; }
}



export function storeImportedEquipment(rows: EquipmentImportRow[]) {
  try { window.localStorage.setItem(importedEquipmentStorageKey, JSON.stringify(rows)); }
  catch { /* The imported rows remain available until this tab closes. */ }
}



export const mapObjects: MapObject[] = [
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



export const trend = [
  { t: '00:00', predictions: 14, incidents: 3 },
  { t: '04:00', predictions: 18, incidents: 4 },
  { t: '08:00', predictions: 31, incidents: 7 },
  { t: '12:00', predictions: 26, incidents: 5 },
  { t: '16:00', predictions: 38, incidents: 9 },
  { t: '20:00', predictions: 29, incidents: 6 },
  { t: '24:00', predictions: 34, incidents: 5 },
];


export const sensorData = [
  { t: '04:00', temp: 58, vibration: 2.1, pressure: 4.8 },
  { t: '06:00', temp: 61, vibration: 2.3, pressure: 4.7 },
  { t: '08:00', temp: 66, vibration: 2.8, pressure: 4.5 },
  { t: '10:00', temp: 71, vibration: 3.2, pressure: 4.4 },
  { t: '12:00', temp: 78, vibration: 4.1, pressure: 4.1 },
  { t: '14:00', temp: 82, vibration: 4.8, pressure: 3.9 },
  { t: '16:00', temp: 87, vibration: 5.6, pressure: 3.7 },
];


export const analyticsMonths = [
  { m: 'Апр', precision: 81, recall: 73, forecasts: 4100, reaction: 23 },
  { m: 'Май', precision: 83, recall: 75, forecasts: 4400, reaction: 22 },
  { m: 'Июн', precision: 84, recall: 78, forecasts: 4620, reaction: 21 },
  { m: 'Июл', precision: 87, recall: 81, forecasts: 4700, reaction: 20 },
  { m: 'Авг', precision: 89, recall: 84, forecasts: 5031, reaction: 19 },
  { m: 'Сен', precision: 91, recall: 86, forecasts: 5790, reaction: 18 },
];



export const predictionContexts: Record<string, {
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
    system: 'Водоудаление', objectId: 'OBJ-101', picket: 'ПК 130', modelVersion: 'Модель прогнозирования',
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



export const defaultPredictionContext = {
  system: 'Инженерная система', objectId: 'OBJ-DEMO', picket: 'ПК 80', modelVersion: 'Модель прогнозирования',
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



export function riskClass(risk: Risk) {
  return `risk risk-${risk.toLowerCase()}`;
}


export function connectionLabel(state: MlConnectionState) {
  return {
    loading: 'Проверка ML',
    online: 'ML API · онлайн',
    degraded: 'ML API · ограничения',
    offline: 'ML API · недоступен',
    unconfigured: 'Нет подключения к API',
  }[state];
}


export function riskScoreLabel(prediction: Pick<PredictionRecord, 'scoreKind'>) {
  switch (prediction.scoreKind) {
    case 'proxy_risk_score': return 'Риск-скор срабатывания';
    case 'maintenance_proxy_score': return 'Скор необходимости ТО';
    case 'security_alarm_proxy_score': return 'Скор охранной тревоги';
    default: return prediction.scoreKind ? 'Риск-скор' : 'Оценка риска';
  }
}


export function riskFromNumber(n: number): Risk {
  return n >= 90
    ? 'Критический'
    : n >= 70
      ? 'Высокий'
      : n >= 40
        ? 'Средний'
        : 'Низкий';
}



export function downloadFile(
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
