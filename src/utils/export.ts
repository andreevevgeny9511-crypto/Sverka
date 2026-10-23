/**
 * Экспорт результатов сверки в различные форматы
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ReconciliationFull, ReconciliationResult } from '../types';
import { formatPrice, formatPercent } from './normalization';

const STATUS_LABELS: Record<string, string> = {
  'MATCH': 'Совпадает',
  'MISMATCH': 'Расхождение',
  'NOT_FOUND_IN_MATRIX': 'Нет в матрице',
  'WAREHOUSE_NOT_FOUND': 'Склад не найден',
  'FUZZY_MATCH': 'Нечёткое совпадение',
  'NO_PRICE': 'Нет цены',
};

/**
 * Экспорт в XLSX (два листа: Сверка и Сводка)
 */
export function exportToXlsx(data: ReconciliationFull): void {
  const wb = XLSX.utils.book_new();

  // Лист "Сверка"
  const verificationRows = [
    ['Сверка цен', '', '', '', '', '', '', '', '', '', ''],
    ['Дата:', new Date().toLocaleString('ru-RU'), '', '', '', '', '', '', '', '', ''],
    ['Склад:', data.summary.warehouse, '', '', '', '', '', '', '', '', ''],
    ['Колонка матрицы:', data.summary.matrixColumn, '', '', '', '', '', '', '', '', ''],
    [],
    ['№', 'Наименование (заказ)', 'Ед.', 'Цена заказа', 'Кол-во', 'Сумма заказа', 
     'Наименование (матрица)', 'Цена матрицы', 'Сумма матрицы', 'Дельта (руб.)', 'Статус'],
  ];

  for (const r of data.results) {
    verificationRows.push([
      String(r.orderItem.rowNumber),
      r.orderItem.name,
      r.orderItem.unit || '',
      String(r.orderItem.price),
      String(r.orderItem.quantity),
      String(r.orderSum),
      r.matrixName || '',
      r.matrixPrice !== null ? String(r.matrixPrice) : '',
      r.matrixSum !== null ? String(r.matrixSum) : '',
      r.delta !== null ? String(r.delta) : '',
      STATUS_LABELS[r.status] || r.status,
    ]);
  }

  const ws1 = XLSX.utils.aoa_to_sheet(verificationRows);
  ws1['!cols'] = [
    { wch: 5 }, { wch: 50 }, { wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 14 },
    { wch: 50 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Сверка');

  // Лист "Сводка"
  const summaryRows = [
    ['Сводка по сверке'],
    ['Дата сверки:', new Date().toLocaleString('ru-RU')],
    ['Склад из заказа:', data.summary.warehouse],
    ['Колонка матрицы:', data.summary.matrixColumn],
    ['Период матрицы:', data.summary.matrixPeriod],
    [],
    ['Показатель', 'Значение'],
    ['Всего позиций', data.summary.totalItems],
    ['Совпало', data.summary.matched],
    ['Расхождения', data.summary.mismatched],
    ['Нечёткие совпадения', data.summary.fuzzyMatched],
    ['Нет в матрице', data.summary.notFound],
    ['Нет цены', data.summary.noPrice],
    [],
    ['Сумма по заказу', data.summary.totalOrderSum],
    ['Сумма по матрице', data.summary.totalMatrixSum],
    ['Суммарное отклонение', data.summary.totalDelta],
    ['Сумма позиций без эталона', data.summary.notFoundSum],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(summaryRows);
  ws2['!cols'] = [{ wch: 30 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Сводка');

  // Сохраняем
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Сверка_цен_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/**
 * Экспорт в CSV
 */
export function exportToCSV(data: ReconciliationFull): void {
  const separator = ';';
  const lines: string[] = [];
  
  // Заголовок
  lines.push([
    '№', 'Наименование (заказ)', 'Ед.', 'Цена заказа', 'Кол-во', 'Сумма заказа',
    'Наименование (матрица)', 'Цена матрицы', 'Сумма матрицы', 'Дельта (руб.)', 'Статус'
  ].join(separator));

  for (const r of data.results) {
    lines.push([
      r.orderItem.rowNumber,
      `"${r.orderItem.name}"`,
      `"${r.orderItem.unit || ''}"`,
      r.orderItem.price,
      r.orderItem.quantity,
      r.orderSum,
      `"${r.matrixName || ''}"`,
      r.matrixPrice ?? '',
      r.matrixSum ?? '',
      r.delta ?? '',
      STATUS_LABELS[r.status] || r.status,
    ].join(separator));
  }

  const csv = '\uFEFF' + lines.join('\n'); // BOM для корректного отображения в Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  saveAs(blob, `Сверка_цен_${new Date().toISOString().slice(0, 10)}.csv`);
}

/**
 * Экспорт в JSON
 */
export function exportToJSON(data: ReconciliationFull): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  saveAs(blob, `Сверка_цен_${new Date().toISOString().slice(0, 10)}.json`);
}
