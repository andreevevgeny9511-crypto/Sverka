/**
 * Экспорт результатов сверки в различные форматы
 */

import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
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
 * Экспорт заказа с ценами из матрицы (сохраняя форматирование исходного файла)
 */
export async function exportOrderWithMatrixPrices(
  data: ReconciliationFull,
  originalFile: File
): Promise<void> {
  const { results, orderData } = data;
  
  // Создаём карту корректировок: индекс позиции -> новая цена
  const correctionsMap = new Map<number, number>();
  results.forEach((r, idx) => {
    if (r.matrixPrice !== null && (r.status === 'MATCH' || r.status === 'MISMATCH' || r.status === 'FUZZY_MATCH')) {
      correctionsMap.set(idx, r.matrixPrice);
    }
  });
  
  try {
    // Читаем исходный файл с помощью exceljs
    const workbook = new ExcelJS.Workbook();
    const buffer = await originalFile.arrayBuffer();
    await workbook.xlsx.load(buffer);
    
    // Получаем первый лист
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Не найден лист в файле заказа');
    }
    
    // Находим строку с заголовками таблицы
    let headerRowNum = -1;
    let priceColNum = -1;
    let sumColNum = -1;
    
    worksheet.eachRow((row, rowNumber) => {
      const firstCell = row.getCell(1).value;
      if (firstCell && typeof firstCell === 'string' && 
          (firstCell.toLowerCase().includes('наименование') || firstCell.toLowerCase().includes('товар'))) {
        headerRowNum = rowNumber;
        
        // Ищем колонки с ценами и суммами
        row.eachCell((cell, colNumber) => {
          const cellValue = cell.value;
          if (cellValue && typeof cellValue === 'string') {
            const lowerValue = cellValue.toLowerCase();
            if (lowerValue.includes('цена') && !lowerValue.includes('сумма')) {
              priceColNum = colNumber;
            } else if (lowerValue.includes('сумма')) {
              sumColNum = colNumber;
            }
          }
        });
      }
    });
    
    if (headerRowNum === -1 || priceColNum === -1) {
      throw new Error('Не найдена строка с заголовками или колонка с ценами');
    }
    
    // Обновляем цены и суммы для каждой позиции
    let itemIndex = 0;
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNum) return;
      
      const firstCell = row.getCell(1).value;
      // Проверяем, что это строка с данными (номер или наименование)
      if (firstCell && (typeof firstCell === 'number' || (typeof firstCell === 'string' && firstCell.trim()))) {
        // Проверяем, что это не итоговая строка
        const rowText = row.getCell(2).value?.toString().toLowerCase() || '';
        if (rowText.includes('итого') || rowText.includes('всего')) return;
        
        const newPrice = correctionsMap.get(itemIndex);
        if (newPrice !== undefined) {
          // Обновляем цену
          const priceCell = row.getCell(priceColNum);
          priceCell.value = newPrice;
          
          // Обновляем сумму, если есть колонка сумм
          if (sumColNum > 0) {
            const qtyCell = row.getCell(priceColNum - 1); // Колонка перед ценой обычно количество
            const qty = typeof qtyCell.value === 'number' ? qtyCell.value : 1;
            const sumCell = row.getCell(sumColNum);
            sumCell.value = newPrice * qty;
          }
        }
        
        itemIndex++;
      }
    });
    
    // Сохраняем workbook
    const outputBuffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([outputBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    saveAs(blob, `Заказ_с_ценами_матрицы_${new Date().toISOString().slice(0, 10)}.xlsx`);
  } catch (error) {
    // Fallback: если не удалось сохранить форматирование, используем стандартный экспорт
    console.warn('Не удалось сохранить форматирование, используем стандартный экспорт:', error);
    
    const wb = XLSX.utils.book_new();
    const wsData: any[][] = [];
    
    // Шапка заказа
    wsData.push([`Заказ поставщику ${orderData.header.orderNumber ? '№ ' + orderData.header.orderNumber : ''} ${orderData.header.orderDate ? 'от ' + orderData.header.orderDate : ''}`]);
    wsData.push([]);
    
    if (orderData.header.supplier) wsData.push(['Поставщик:', orderData.header.supplier]);
    if (orderData.header.buyer) wsData.push(['Покупатель:', orderData.header.buyer]);
    if (orderData.header.receiver) wsData.push(['Грузополучатель:', orderData.header.receiver]);
    if (orderData.header.warehouse) wsData.push(['Склад:', orderData.header.warehouse]);
    
    wsData.push([]);
    
    // Заголовки таблицы
    wsData.push(['№', 'Штрихкод', 'Наименование', 'Квант', 'Кол-во', 'Ед.', 'Цена', 'Сумма']);
    
    // Строки данных с новыми ценами
    orderData.items.forEach((item, idx) => {
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
    const totalSum = orderData.items.reduce((acc, item, idx) => {
      const newPrice = correctionsMap.get(idx);
      const price = newPrice !== undefined ? newPrice : item.price;
      const quantity = item.quantity || 1;
      return acc + (price * quantity);
    }, 0);
    
    wsData.push([]);
    wsData.push(['Итого', '', '', '', '', '', '', totalSum]);
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [
      { wch: 5 }, { wch: 14 }, { wch: 50 }, { wch: 8 }, { wch: 8 }, { wch: 6 }, { wch: 12 }, { wch: 14 },
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Заказ');
    
    const wbout = XLSX.write(wb, { bookType: 'xlsx', bookSST: false, type: 'array' });
    const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `Заказ_с_ценами_матрицы_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
}
