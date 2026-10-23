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

/**
 * Экспорт заказа с ценами из матрицы (в формате исходного заказа)
 */
export function exportOrderWithMatrixPrices(data: ReconciliationFull): void {
  const { orderData, results } = data;
  const { header, items } = orderData;
  
  // Создаём карту корректировок: индекс позиции -> новая цена
  const correctionsMap = new Map<number, number>();
  results.forEach((r, idx) => {
    if (r.matrixPrice !== null && (r.status === 'MATCH' || r.status === 'MISMATCH' || r.status === 'FUZZY_MATCH')) {
      correctionsMap.set(idx, r.matrixPrice);
    }
  });
  
  // Создаём новый Workbook
  const wb = XLSX.utils.book_new();
  
  // Формируем данные листа
  const wsData: any[][] = [];
  
  // Шапка заказа
  wsData.push([`Заказ поставщику ${header.orderNumber ? '№ ' + header.orderNumber : ''} ${header.orderDate ? 'от ' + header.orderDate : ''}`]);
  wsData.push([]);
  
  if (header.supplier) wsData.push(['Поставщик:', header.supplier]);
  if (header.buyer) wsData.push(['Покупатель:', header.buyer]);
  if (header.receiver) wsData.push(['Грузополучатель:', header.receiver]);
  if (header.warehouse) wsData.push(['Склад:', header.warehouse]);
  
  wsData.push([]);
  
  // Заголовки таблицы
  wsData.push(['№', 'Штрихкод', 'Наименование', 'Квант', 'Кол-во', 'Ед.', 'Цена', 'Сумма']);
  
  // Строки данных с новыми ценами
  items.forEach((item, idx) => {
    const newPrice = correctionsMap.get(idx);
    const price = newPrice !== undefined ? newPrice : item.price;
    const quantity = item.quantity || 1;
    const sum = price * quantity;
    
    wsData.push([
      item.rowNumber,
      item.barcode,
      item.name,
      item.quant,
      item.quantity,
      item.unit,
      price,
      sum,
    ]);
  });
  
  // Итого
  const totalSum = items.reduce((acc, item, idx) => {
    const newPrice = correctionsMap.get(idx);
    const price = newPrice !== undefined ? newPrice : item.price;
    const quantity = item.quantity || 1;
    return acc + (price * quantity);
  }, 0);
  
  wsData.push([]);
  wsData.push(['Итого', '', '', '', '', '', '', totalSum]);
  
  // Создаём лист
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Устанавливаем ширины колонок (как в типичном заказе)
  ws['!cols'] = [
    { wch: 5 },   // №
    { wch: 14 },  // Штрихкод
    { wch: 50 },  // Наименование
    { wch: 8 },   // Квант
    { wch: 8 },   // Кол-во
    { wch: 6 },   // Ед.
    { wch: 12 },  // Цена
    { wch: 14 },  // Сумма
  ];
  
  // Устанавливаем стили ячеек
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  
  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddress]) continue;
      
      // Заголовок заказа (первая строка)
      if (R === 0) {
        ws[cellAddress].s = {
          font: { bold: true, sz: 14 },
          alignment: { horizontal: 'left' },
        };
      }
      // Заголовки таблицы
      else if (wsData[R] && typeof wsData[R][0] === 'string' && 
               ['№', 'Штрихкод', 'Наименование'].includes(wsData[R][0])) {
        ws[cellAddress].s = {
          font: { bold: true, sz: 11 },
          fill: { fgColor: { rgb: 'E7E6E6' } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        };
      }
      // Строки данных
      else if (R > 0 && wsData[R] && typeof wsData[R][0] === 'number') {
        ws[cellAddress].s = {
          font: { sz: 10 },
          alignment: { 
            horizontal: C === 2 ? 'left' : C === 0 ? 'center' : 'right',
            vertical: 'center',
            wrapText: C === 2,
          },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } },
          },
        };
        
        // Формат для числовых ячеек
        if (C === 6 || C === 7) { // Цена и Сумма
          ws[cellAddress].z = '#,##0.00';
        }
      }
      // Итого
      else if (wsData[R] && wsData[R][0] === 'Итого') {
        ws[cellAddress].s = {
          font: { bold: true, sz: 11 },
          alignment: { horizontal: C === 7 ? 'right' : 'left' },
          border: {
            top: { style: 'medium', color: { rgb: '000000' } },
            bottom: { style: 'medium', color: { rgb: '000000' } },
          },
        };
        if (C === 7) {
          ws[cellAddress].z = '#,##0.00';
        }
      }
    }
  }
  
  // Устанавливаем высоту строк
  ws['!rows'] = [];
  for (let R = 0; R <= range.e.r; ++R) {
    ws['!rows'].push({ hpt: R === 0 ? 20 : 15 });
  }
  
  XLSX.utils.book_append_sheet(wb, ws, 'Заказ');
  
  // Сохраняем
  const wbout = XLSX.write(wb, { bookType: 'xlsx', bookSST: false, type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, `Заказ_с_ценами_матрицы_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
