/**
 * Экспорт результатов сверки в различные форматы
 */

import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
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
 * Использует прямую работу с XML внутри xlsx для сохранения всего форматирования
 */
export async function exportOrderWithMatrixPrices(
  data: ReconciliationFull,
  originalFile: File
): Promise<void> {
  const { results } = data;
  
  console.log('Начинаем экспорт заказа с ценами матрицы...');
  console.log('Количество результатов:', results.length);
  
  // Создаём карту корректировок: индекс позиции -> {новая цена, статус}
  const correctionsMap = new Map<number, { price: number | null; status: string }>();
  results.forEach((r, idx) => {
    if (r.status === 'MATCH' || r.status === 'MISMATCH' || r.status === 'FUZZY_MATCH') {
      correctionsMap.set(idx, { price: r.matrixPrice, status: r.status });
    } else if (r.status === 'NOT_FOUND_IN_MATRIX' || r.status === 'NO_PRICE') {
      correctionsMap.set(idx, { price: null, status: r.status });
    }
  });
  
  console.log('Карта корректировок создана, размер:', correctionsMap.size);
  
  try {
    // Читаем исходный файл как ArrayBuffer
    const arrayBuffer = await originalFile.arrayBuffer();
    console.log('Файл прочитан, размер:', arrayBuffer.byteLength);
    
    // Распаковываем xlsx (это ZIP архив)
    const zip = await JSZip.loadAsync(arrayBuffer);
    console.log('ZIP распакован');
    
    // Находим первый лист (обычно xl/worksheets/sheet1.xml)
    const sheetFiles = zip.file(/xl\/worksheets\/sheet\d+\.xml/);
    if (sheetFiles.length === 0) {
      throw new Error('Не найден лист в файле');
    }
    
    const sheetFile = sheetFiles[0];
    console.log('Найден лист:', sheetFile.name);
    
    // Читаем XML листа
    const sheetXml = await sheetFile.async('string');
    console.log('XML прочитан, длина:', sheetXml.length);
    
    // Парсим XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(sheetXml, 'text/xml');
    
    // Находим строку с заголовками
    const rows = xmlDoc.getElementsByTagName('row');
    let headerRowIndex = -1;
    let priceColIndex = -1;
    let sumColIndex = -1;
    let qtyColIndex = -1;
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.getElementsByTagName('c');
      
      let hasName = false;
      let hasPrice = false;
      let hasSum = false;
      
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        const cellValue = cell.getElementsByTagName('v')[0]?.textContent || '';
        const cellRef = cell.getAttribute('r') || '';
        const colLetter = cellRef.replace(/[0-9]/g, '');
        
        // Проверяем тип ячейки
        const cellType = cell.getAttribute('t');
        let textValue = cellValue;
        
        // Если тип 's', то это ссылка на shared strings
        if (cellType === 's') {
          const sharedStringsFile = zip.file('xl/sharedStrings.xml');
          if (sharedStringsFile) {
            const sharedStringsXml = await sharedStringsFile.async('string');
            const sharedStringsDoc = parser.parseFromString(sharedStringsXml, 'text/xml');
            const strings = sharedStringsDoc.getElementsByTagName('si');
            const stringIndex = parseInt(cellValue);
            if (strings[stringIndex]) {
              const tElement = strings[stringIndex].getElementsByTagName('t')[0];
              textValue = tElement?.textContent || '';
            }
          }
        }
        
        const lowerValue = textValue.toLowerCase();
        
        if (lowerValue.includes('наименование') || lowerValue.includes('товар')) {
          hasName = true;
        }
        if (lowerValue.includes('цена') && !lowerValue.includes('сумма')) {
          priceColIndex = colLetterToIndex(colLetter);
          hasPrice = true;
        }
        if (lowerValue.includes('сумма')) {
          sumColIndex = colLetterToIndex(colLetter);
          hasSum = true;
        }
        if (lowerValue.includes('кол-во') || lowerValue.includes('количество')) {
          qtyColIndex = colLetterToIndex(colLetter);
        }
      }
      
      if (hasName && (hasPrice || hasSum)) {
        headerRowIndex = i;
        console.log('Найдена строка заголовков:', i, 'Колонка цены:', priceColIndex, 'Колонка суммы:', sumColIndex);
        break;
      }
    }
    
    if (headerRowIndex === -1 || priceColIndex === -1) {
      throw new Error('Не найдена строка с заголовками или колонка с ценами');
    }
    
    // Обновляем цены и суммы для каждой позиции
    let itemIndex = 0;
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const row = rows[i];
      const cells = row.getElementsByTagName('c');
      
      if (cells.length === 0) continue;
      
      // Проверяем, что это строка с данными
      const firstCell = cells[0];
      const firstCellRef = firstCell.getAttribute('r') || '';
      const firstCellType = firstCell.getAttribute('t');
      const firstCellValue = firstCell.getElementsByTagName('v')[0]?.textContent || '';
      
      // Пропускаем итоговые строки
      if (cells.length > 1) {
        const secondCell = cells[1];
        const secondCellType = secondCell.getAttribute('t');
        let secondCellValue = secondCell.getElementsByTagName('v')[0]?.textContent || '';
        
        if (secondCellType === 's') {
          const sharedStringsFile = zip.file('xl/sharedStrings.xml');
          if (sharedStringsFile) {
            const sharedStringsXml = await sharedStringsFile.async('string');
            const sharedStringsDoc = parser.parseFromString(sharedStringsXml, 'text/xml');
            const strings = sharedStringsDoc.getElementsByTagName('si');
            const stringIndex = parseInt(secondCellValue);
            if (strings[stringIndex]) {
              const tElement = strings[stringIndex].getElementsByTagName('t')[0];
              secondCellValue = tElement?.textContent || '';
            }
          }
        }
        
        const rowText = secondCellValue.toLowerCase();
        if (rowText.includes('итого') || rowText.includes('всего') || rowText.includes('ндс')) {
          continue;
        }
      }
      
      // Проверяем, что это строка с данными
      const isDataRow = firstCellValue.trim() !== '';
      
      if (isDataRow) {
        const correction = correctionsMap.get(itemIndex);
        
        if (correction) {
          // Находим ячейку с ценой
          for (let j = 0; j < cells.length; j++) {
            const cell = cells[j];
            const cellRef = cell.getAttribute('r') || '';
            const colLetter = cellRef.replace(/[0-9]/g, '');
            const colIndex = colLetterToIndex(colLetter);
            
            if (colIndex === priceColIndex) {
              const vElement = cell.getElementsByTagName('v')[0];
              
              if (correction.price !== null) {
                // Устанавливаем новую цену
                if (vElement) {
                  vElement.textContent = correction.price.toString();
                  cell.setAttribute('t', 'n'); // Числовой тип
                }
                
                // Обновляем сумму
                if (sumColIndex >= 0 && qtyColIndex >= 0) {
                  // Находим ячейку с количеством
                  let qty = 1;
                  for (let k = 0; k < cells.length; k++) {
                    const qtyCell = cells[k];
                    const qtyCellRef = qtyCell.getAttribute('r') || '';
                    const qtyColLetter = qtyCellRef.replace(/[0-9]/g, '');
                    const qtyColIdx = colLetterToIndex(qtyColLetter);
                    
                    if (qtyColIdx === qtyColIndex) {
                      const qtyValue = qtyCell.getElementsByTagName('v')[0]?.textContent || '1';
                      qty = parseFloat(qtyValue) || 1;
                      break;
                    }
                  }
                  
                  // Находим ячейку с суммой и обновляем
                  for (let k = 0; k < cells.length; k++) {
                    const sumCell = cells[k];
                    const sumCellRef = sumCell.getAttribute('r') || '';
                    const sumColLetter = sumCellRef.replace(/[0-9]/g, '');
                    const sumColIdx = colLetterToIndex(sumColLetter);
                    
                    if (sumColIdx === sumColIndex) {
                      const sumVElement = sumCell.getElementsByTagName('v')[0];
                      if (sumVElement) {
                        sumVElement.textContent = (correction.price * qty).toString();
                        sumCell.setAttribute('t', 'n');
                      }
                      break;
                    }
                  }
                }
              } else {
                // Позиция не найдена - ставим "НЕТ"
                // Для этого нужно добавить строку в sharedStrings
                const sharedStringsFile = zip.file('xl/sharedStrings.xml');
                if (sharedStringsFile) {
                  const sharedStringsXml = await sharedStringsFile.async('string');
                  const sharedStringsDoc = parser.parseFromString(sharedStringsXml, 'text/xml');
                  const strings = sharedStringsDoc.getElementsByTagName('sst');
                  const count = parseInt(strings[0]?.getAttribute('count') || '0');
                  
                  // Добавляем новую строку "НЕТ"
                  const siElement = sharedStringsDoc.createElement('si');
                  const tElement = sharedStringsDoc.createElement('t');
                  tElement.textContent = 'НЕТ';
                  siElement.appendChild(tElement);
                  strings[0]?.appendChild(siElement);
                  
                  // Обновляем счётчик
                  strings[0]?.setAttribute('count', (count + 1).toString());
                  strings[0]?.setAttribute('uniqueCount', (count + 1).toString());
                  
                  // Сохраняем обновлённые shared strings
                  const serializer = new XMLSerializer();
                  const updatedSharedStrings = serializer.serializeToString(sharedStringsDoc);
                  zip.file('xl/sharedStrings.xml', updatedSharedStrings);
                  
                  // Обновляем ячейку с ценой
                  if (vElement) {
                    vElement.textContent = count.toString(); // Индекс новой строки
                    cell.setAttribute('t', 's'); // Тип 's' - shared string
                  }
                  
                  // Обнуляем сумму
                  if (sumColIndex >= 0) {
                    for (let k = 0; k < cells.length; k++) {
                      const sumCell = cells[k];
                      const sumCellRef = sumCell.getAttribute('r') || '';
                      const sumColLetter = sumCellRef.replace(/[0-9]/g, '');
                      const sumColIdx = colLetterToIndex(sumColLetter);
                      
                      if (sumColIdx === sumColIndex) {
                        const sumVElement = sumCell.getElementsByTagName('v')[0];
                        if (sumVElement) {
                          sumVElement.textContent = '0';
                          sumCell.setAttribute('t', 'n');
                        }
                        break;
                      }
                    }
                  }
                }
              }
              break;
            }
          }
        }
        
        itemIndex++;
      }
    }
    
    console.log('Обновлено позиций:', itemIndex);
    
    // Сохраняем обновлённый XML листа
    const serializer = new XMLSerializer();
    const updatedSheetXml = serializer.serializeToString(xmlDoc);
    zip.file(sheetFile.name, updatedSheetXml);
    
    // Запаковываем обратно
    const outputBuffer = await zip.generateAsync({ type: 'arraybuffer' });
    console.log('Файл запакован, размер:', outputBuffer.byteLength);
    
    // Создаём Blob и скачиваем
    const blob = new Blob([outputBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    saveAs(blob, `Заказ_с_ценами_матрицы_${new Date().toISOString().slice(0, 10)}.xlsx`);
    console.log('Файл сохранён');
    
  } catch (error) {
    console.error('Ошибка при экспорте:', error);
    throw error;
  }
}

/**
 * Преобразует букву колонки (A, B, ..., Z, AA, AB, ...) в индекс (0, 1, ..., 25, 26, 27, ...)
 */
function colLetterToIndex(colLetter: string): number {
  let index = 0;
  for (let i = 0; i < colLetter.length; i++) {
    index = index * 26 + (colLetter.charCodeAt(i) - 64);
  }
  return index - 1;
}
