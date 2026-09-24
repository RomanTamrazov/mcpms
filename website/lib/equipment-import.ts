export type EquipmentImportRow = {
  id: string;
  object: string;
  type: string;
  state: string;
  value: string;
  risk: number;
  last: string;
  next: string;
};

export type EquipmentImportPreview = {
  rows: EquipmentImportRow[];
  rowCount: number;
  errors: string[];
};

const requiredHeaders = ['id', 'объект', 'тип', 'состояние', 'значение', 'риск', 'последнее то', 'следующее то'];
const allowedStates = new Set(['Требует внимания', 'Нестабильно', 'Работает', 'Исправно']);

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim()); field = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return { rows, unterminatedQuote: quoted };
}

export function parseEquipmentCsv(raw: string): EquipmentImportPreview {
  const text = raw.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const parsed = parseDelimited(text, delimiter);
  if (parsed.unterminatedQuote) return { rows: [], rowCount: 0, errors: ['Незакрытое поле в кавычках.'] };
  const [header, ...dataRows] = parsed.rows;
  if (!header) return { rows: [], rowCount: 0, errors: ['Файл пуст.'] };
  const normalizedHeader = header.map((cell) => cell.toLocaleLowerCase('ru').replace(/\s+/g, ' ').trim());
  const indices = requiredHeaders.map((name) => normalizedHeader.indexOf(name));
  const missing = requiredHeaders.filter((_, index) => indices[index] < 0);
  if (missing.length > 0) return { rows: [], rowCount: dataRows.length, errors: [`Не найдены колонки: ${missing.join(', ')}.`] };
  const errors: string[] = [];
  const rows: EquipmentImportRow[] = [];
  const ids = new Set<string>();
  for (const [index, cells] of dataRows.entries()) {
    const [id, object, type, state, value, rawRisk, last, next] = indices.map((position) => cells[position]?.trim() || '');
    const risk = Number(rawRisk.replace('%', '').replace(',', '.'));
    const datePattern = /^\d{2}\.\d{2}\.\d{4}$/;
    const problems: string[] = [];
    if (!id || !object || !type || !value) problems.push('обязательные поля пусты');
    if (!allowedStates.has(state)) problems.push('неизвестное состояние');
    if (!Number.isFinite(risk) || risk < 0 || risk > 100) problems.push('риск должен быть от 0 до 100');
    if (!datePattern.test(last) || !datePattern.test(next)) problems.push('дата должна быть ДД.ММ.ГГГГ');
    if (ids.has(id)) problems.push('повторяющийся ID');
    if (cells.length !== header.length) problems.push('число полей не совпадает с заголовком');
    if (problems.length > 0) {
      if (errors.length < 30) errors.push(`Строка ${index + 2}: ${problems.join(', ')}.`);
      continue;
    }
    ids.add(id);
    rows.push({ id, object, type, state, value, risk, last, next });
  }
  if (dataRows.length > 30 && errors.length === 30) errors.push('Показаны первые 30 ошибок.');
  if (dataRows.length === 0) errors.push('В файле нет записей для импорта.');
  return { rows, rowCount: dataRows.length, errors };
}
