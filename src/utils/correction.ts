/**
 * Утилита для генерации скорректированного файла заказа
 * Заменяет цены в заказе на эталонные из матрицы и сохраняет в XLSX
 */

import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { ReconciliationFull, ReconciliationResult, OrderData } from '../types';
import { formatPrice } from './normalization';

export type CorrectionMode = 'all_mismatches' | 'all_with_fuzzy' | 'selected';

export interface CorrectionOptions {
  mode: CorrectionMode;
  selectedIndices?: Set<number>; // индексы позиций для режима 'selected'
  includeFuzzy: boolean;
  includeMismatch: boolean;
  includeNotFound: boolean; // если true — позиции без эталона не трогаем, но помечаем
  rounding: number; // округление цены (0 — без округления, 2 — до копеек)
}

export const DEFAULT_CORRECTION_OPTIONS: CorrectionOptions = {
  mode: 'all_mismatches',
  includeFuzzy: false,
  includeMismatch: true,
  includeNotFound: false,
  rounding: 2,
};

interface CorrectionLog {
  rowIndex: number;
  itemName: string;
  originalPrice: number;
  newPrice: number;
  delta: number;
  status: string;
}

/**
 * Генерация скорректированного файла заказа в XLSX
 */
export function generateCorrectedOrder(
  data: ReconciliationFull,
  options: CorrectionOptions
): void {
  const { orderData, results, selectedColumn } = data;
  
  if (!selectedColumn) {
    throw new Error('Не выбрана колонка склада — нечего корректировать');
  }

  // Определяем, какие позиции нужно скорректировать
  const correctionsMap = buildCorrectionsMap(results, options);
  
  // Создаём новую таблицу заказа с исправленными ценами
  type CorrectedItem = OrderData['items'][0] & {
    _corrected: boolean;
    _originalPrice: number;
    _delta: number;
  };
  
  const correctedItems: CorrectedItem[] = orderData.items.map((item, idx): CorrectedItem => {
    const correction = correctionsMap.get(idx);
    if (correction) {
      const newPrice = options.rounding > 0 
        ? Math.round(correction.newPrice * Math.pow(10, options.rounding)) / Math.pow(10, options.rounding)
        : correction.newPrice;
      const quantity = item.quantity || 1;
      return {
        ...item,
        price: newPrice,
        sum: newPrice * quantity,
        _corrected: true,
        _originalPrice: item.price,
        _delta: correction.delta,
      };
    }
    return { 
      ...item, 
      _corrected: false,
      _originalPrice: item.price,
      _delta: 0,
    };
  });

  // Формируем XLSX
  const wb = XLSX.utils.book_new();

  // Лист "Заказ (исправленный)"
  const headerRows = buildOrderHeader(orderData);
  const dataRows = correctedItems.map((item, idx) => [
    item.rowNumber,
    item.barcode,
    item.name,
    item.quant,
    item.quantity,
    item.unit,
    item.price,
    item.sum,
    item._corrected ? '✓ Исправлено' : '',
    item._corrected ? formatPrice(item._originalPrice) : '',
    item._corrected ? formatPrice(item._delta) : '',
  ]);

  // Итого
  const totalSum = correctedItems.reduce((acc, item) => acc + (item.sum || 0), 0);
  const footerRows = [
    [],
    ['Итого', '', '', '', '', '', '', totalSum, '', '', ''],
  ];

  const sheetData = [...headerRows, ...dataRows, ...footerRows];
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  
  // Ширина колонок
  ws['!cols'] = [
    { wch: 5 },   // №
    { wch: 15 },  // Штрихкод
    { wch: 50 },  // Наименование
    { wch: 8 },   // Квант
    { wch: 8 },   // Кол-во
    { wch: 6 },   // Ед.
    { wch: 12 },  // Цена
    { wch: 14 },  // Сумма
    { wch: 14 },  // Статус
    { wch: 12 },  // Исходная цена
    { wch: 12 },  // Дельта
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Заказ (исправленный)');

  // Лист "Лог корректировок"
  const logRows = buildCorrectionLog(results, correctionsMap);
  const wsLog = XLSX.utils.aoa_to_sheet(logRows);
  wsLog['!cols'] = [
    { wch: 5 },
    { wch: 50 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsLog, 'Лог корректировок');

  // Лист "Сводка"
  const summaryRows = buildCorrectionSummary(data, correctionsMap, options);
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  wsSummary['!cols'] = [{ wch: 35 }, { wch: 25 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Сводка');

  // Сохраняем
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const fileName = `Заказ_исправленный_${new Date().toISOString().slice(0, 10)}.xlsx`;
  saveAs(blob, fileName);
}

/**
 * Определение карты корректировок: индекс позиции → новая цена
 */
function buildCorrectionsMap(
  results: ReconciliationResult[],
  options: CorrectionOptions
): Map<number, { newPrice: number; delta: number }> {
  const map = new Map<number, { newPrice: number; delta: number }>();

  results.forEach((r, idx) => {
    if (r.matrixPrice === null) return;

    let shouldCorrect = false;

    switch (options.mode) {
      case 'all_mismatches':
        shouldCorrect = r.status === 'MISMATCH' || 
          (options.includeFuzzy && r.status === 'FUZZY_MATCH' && r.delta !== null && Math.abs(r.delta) > 0.01);
        break;
      case 'all_with_fuzzy':
        shouldCorrect = (r.status === 'MISMATCH' || r.status === 'FUZZY_MATCH') && 
          r.delta !== null && Math.abs(r.delta) > 0.01;
        break;
      case 'selected':
        shouldCorrect = options.selectedIndices?.has(idx) || false;
        break;
    }

    if (shouldCorrect) {
      map.set(idx, {
        newPrice: r.matrixPrice,
        delta: r.delta || 0,
      });
    }
  });

  return map;
}

/**
 * Формирование шапки заказа для XLSX
 */
function buildOrderHeader(orderData: OrderData): any[][] {
  const { header } = orderData;
  const rows: any[][] = [];
  
  rows.push([`Заказ поставщику ${header.orderNumber ? '№ ' + header.orderNumber : ''} ${header.orderDate ? 'от ' + header.orderDate : ''}`]);
  rows.push([]);
  
  if (header.supplier) rows.push(['Поставщик:', header.supplier]);
  if (header.buyer) rows.push(['Покупатель:', header.buyer]);
  if (header.receiver) rows.push(['Грузополучатель:', header.receiver]);
  if (header.warehouse) rows.push(['Склад:', header.warehouse]);
  
  rows.push([]);
  rows.push(['№', 'Штрихкод', 'Наименование', 'Квант', 'Кол-во', 'Ед.', 'Цена', 'Сумма', 'Статус', 'Исходная цена', 'Дельта']);
  
  return rows;
}

/**
 * Формирование лога корректировок
 */
function buildCorrectionLog(
  results: ReconciliationResult[],
  correctionsMap: Map<number, { newPrice: number; delta: number }>
): any[][] {
  const rows: any[][] = [
    ['Лог корректировок цен'],
    ['Дата:', new Date().toLocaleString('ru-RU')],
    [],
    ['№', 'Наименование', 'Цена (было)', 'Цена (стало)', 'Дельта', 'Статус'],
  ];

  results.forEach((r, idx) => {
    const correction = correctionsMap.get(idx);
    if (correction) {
      rows.push([
        r.orderItem.rowNumber,
        r.orderItem.name,
        r.orderItem.price,
        correction.newPrice,
        correction.delta,
        r.status,
      ]);
    }
  });

  if (correctionsMap.size === 0) {
    rows.push(['', 'Нет позиций для корректировки', '', '', '', '']);
  }

  return rows;
}

/**
 * Формирование сводки корректировки
 */
function buildCorrectionSummary(
  data: ReconciliationFull,
  correctionsMap: Map<number, { newPrice: number; delta: number }>,
  options: CorrectionOptions
): any[][] {
  const { summary, results } = data;
  
  let correctedCount = correctionsMap.size;
  let totalCorrectionDelta = 0;
  
  for (const [, corr] of correctionsMap) {
    totalCorrectionDelta += corr.delta;
  }

  const rows: any[][] = [
    ['Сводка по корректировке'],
    ['Дата:', new Date().toLocaleString('ru-RU')],
    [],
    ['Параметр', 'Значение'],
    ['Склад', summary.warehouse],
    ['Колонка матрицы', summary.matrixColumn],
    [],
    ['Режим корректировки', 
      options.mode === 'all_mismatches' ? 'Все расхождения' : 
      options.mode === 'all_with_fuzzy' ? 'Все расхождения + нечёткие' : 
      'Выбранные позиции'],
    ['Количество скорректированных позиций', correctedCount],
    ['Сумма коррекции (общая дельта)', totalCorrectionDelta],
    [],
    ['Исходная сумма заказа', summary.totalOrderSum],
    ['Новая сумма заказа (после коррекции)', summary.totalOrderSum + totalCorrectionDelta],
    [],
    ['Статистика сверки:', ''],
    ['Совпало', summary.matched],
    ['Расхождения', summary.mismatched],
    ['Нечёткие совпадения', summary.fuzzyMatched],
    ['Нет в матрице', summary.notFound],
    ['Нет цены', summary.noPrice],
  ];

  return rows;
}

/**
 * Подсчёт количества позиций, которые будут скорректированы
 */
export function countCorrections(
  results: ReconciliationResult[],
  options: CorrectionOptions
): number {
  const map = buildCorrectionsMap(results, options);
  return map.size;
}

/**
 * Подсчёт суммы коррекции
 */
export function sumCorrections(
  results: ReconciliationResult[],
  options: CorrectionOptions
): number {
  const map = buildCorrectionsMap(results, options);
  let total = 0;
  for (const [, corr] of map) {
    total += corr.delta;
  }
  return total;
}
