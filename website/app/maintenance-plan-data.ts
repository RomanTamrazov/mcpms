export type PprScheduleRow = {
  object: string;
  month: string;
  sensors: number;
  demount: string | null;
  delivery: string | null;
  removal: string | null;
  acceptance: string | null;
};

// Imported from the supplied 2026 PPR workbook. Object names are anonymised in
// the source, so these rows intentionally are not joined to ML object IDs.
export const pprSchedule: PprScheduleRow[] = [
  { object: 'Объект 1', month: 'Январь', sensors: 56, demount: '12.01.2026', delivery: 'до 9:00 13.01.2026', removal: '22.01.2026', acceptance: '27.01.2026' },
  { object: 'Объект 2', month: 'Январь', sensors: 13, demount: null, delivery: null, removal: null, acceptance: '28.01.2026' },
  { object: 'Объект 3', month: 'Февраль', sensors: 62, demount: '29.01.2026', delivery: 'до 9:00 30.01.2026', removal: '09.02.2026', acceptance: '12.02.2026' },
  { object: 'Объект 4', month: 'Февраль', sensors: 47, demount: '13.02.2026', delivery: 'до 9:00 16.02.2026', removal: '24.02.2026', acceptance: '27.02.2026' },
  { object: 'Объект 5', month: 'Март', sensors: 102, demount: '02.03.2026', delivery: 'до 9:00 03.03.2026', removal: '13.03.2026', acceptance: '19.03.2026' },
  { object: 'Объект 6', month: 'Март', sensors: 34, demount: '23.03.2026', delivery: 'до 9:00 24.03.2026', removal: '03.04.2026', acceptance: '08.04.2026' },
  { object: 'Объект 7', month: 'Март', sensors: 12, demount: null, delivery: null, removal: null, acceptance: null },
  { object: 'Объект 8', month: 'Апрель', sensors: 101, demount: '09.04.2026', delivery: 'до 9:00 10.04.2026', removal: '17.04.2026', acceptance: '22.04.2026' },
  { object: 'Объект 9', month: 'Апрель', sensors: 40, demount: '23.04.2026', delivery: 'до 9:00 24.04.2026', removal: '07.05.2026', acceptance: '14.05.2026' },
  { object: 'Объект 10', month: 'Май', sensors: 6, demount: '15.05.2026', delivery: 'до 9:00 18.05.2026', removal: '26.05.2026', acceptance: '29.05.2026' },
  { object: 'Объект 11', month: 'Май', sensors: 8, demount: null, delivery: null, removal: null, acceptance: null },
  { object: 'Объект 12', month: 'Май', sensors: 21, demount: null, delivery: null, removal: null, acceptance: null },
  { object: 'Объект 13', month: 'Май', sensors: 21, demount: null, delivery: null, removal: null, acceptance: null },
  { object: 'Объект 14', month: 'Июнь', sensors: 33, demount: '04.06.2026', delivery: 'до 9:00 05.06.2026', removal: '18.06.2026', acceptance: '29.06.2026' },
  { object: 'Объект 15', month: 'Июль', sensors: 41, demount: '02.07.2026', delivery: 'до 9:00 03.07.2026', removal: '16.07.2026', acceptance: '23.07.2026' },
  { object: 'Объект 16', month: 'Август', sensors: 95, demount: '28.07.2026', delivery: 'до 9:00 29.07.2026', removal: '14.08.2026', acceptance: '19.08.2026' },
  { object: 'Объект 17', month: 'Август', sensors: 22, demount: null, delivery: null, removal: null, acceptance: '21.08.2026' },
  { object: 'Объект 18', month: 'Август', sensors: 21, demount: '24.08.2026', delivery: 'до 9:00 25.08.2026', removal: '04.09.2026', acceptance: '10.09.2026' },
  { object: 'Объект 19', month: 'Август', sensors: 5, demount: null, delivery: null, removal: null, acceptance: null },
  { object: 'Объект 20', month: 'Сентябрь', sensors: 79, demount: '15.09.2026', delivery: 'до 9:00 16.09.2026', removal: '30.09.2026', acceptance: '07.10.2026' },
  { object: 'Объект 21', month: 'Сентябрь', sensors: 17, demount: null, delivery: null, removal: null, acceptance: '08.10.2026' },
  { object: 'Объект 22', month: 'Октябрь', sensors: 22, demount: '13.10.2026', delivery: 'до 9:00 14.10.2026', removal: '23.10.2026', acceptance: '29.10.2026' },
  { object: 'Объект 23', month: 'Октябрь', sensors: 36, demount: null, delivery: null, removal: null, acceptance: null },
  { object: 'Объект 24', month: 'Октябрь', sensors: 4, demount: null, delivery: null, removal: null, acceptance: null },
  { object: 'Объект 25', month: 'Ноябрь', sensors: 55, demount: '05.11.2026', delivery: 'до 9:00 06.11.2026', removal: '19.11.2026', acceptance: '25.11.2026' },
  { object: 'Объект 26', month: 'Декабрь', sensors: 55, demount: '02.12.2026', delivery: 'до 9:00 03.12.2026', removal: '17.12.2026', acceptance: '22.12.2026' },
];

export const maintenanceByMonth = [
  { month: 'Янв', to: 44, toTr: 11, tr: 0 }, { month: 'Фев', to: 27, toTr: 14, tr: 0 },
  { month: 'Мар', to: 29, toTr: 6, tr: 0 }, { month: 'Апр', to: 40, toTr: 22, tr: 0 },
  { month: 'Май', to: 25, toTr: 22, tr: 0 }, { month: 'Июн', to: 29, toTr: 4, tr: 0 },
  { month: 'Июл', to: 48, toTr: 7, tr: 0 }, { month: 'Авг', to: 33, toTr: 8, tr: 1 },
  { month: 'Сен', to: 28, toTr: 7, tr: 1 }, { month: 'Окт', to: 35, toTr: 27, tr: 0 },
  { month: 'Ноя', to: 41, toTr: 6, tr: 0 }, { month: 'Дек', to: 29, toTr: 4, tr: 0 },
];

export const equipmentPlanSummary = [
  ['Кабельные линии АКМ', 22], ['Кабельные линии ДУ', 23], ['Газоанализаторы', 16],
  ['БП', 14], ['БУиК, БСУ', 14], ['МУСБ', 11], ['Пульт СЗ (ПУИ)', 8], ['ГАСБ', 7],
  ['ПККГ', 4], ['Повторитель интерфейса', 4], ['ИБП', 4], ['УЛСБ-А', 4],
  ['Аппарат сигнализации (АС-9)', 2], ['Двухпортовый преобразователь', 2],
  ['МОД', 1], ['МУИ', 1], ['Усилитель линии УСЛБ-А', 1], ['УЛСБ', 1],
  ['Двухпортовый преобразователь N-port 5232', 1],
].map(([equipment, positions]) => ({ equipment, positions }));
