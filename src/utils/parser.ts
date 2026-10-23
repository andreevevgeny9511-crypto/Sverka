/**
 * Парсер Excel-файлов для заказа и матрицы товаров
 * Поддерживает .xlsx и .xls через библиотеку SheetJS (xlsx)
 * Не использует фиксированные координаты — находит шапку эвристически
 */

import * as XLSX from 'xlsx';
import {
  OrderData,
  OrderHeader,
  OrderItem,
  MatrixData,
  MatrixWarehouseColumn,
  MatrixItem,
} from '../types';
import { parsePrice, extractWarehouseName } from './normalization';

/**
 * Парсинг файла заказа поставщику
 */
export function parseOrderFile(file: File): Promise<OrderData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (jsonData.length === 0) {
          reject(new Error('Файл заказа пуст'));
          return;
        }

        const { header, items } = parseOrderSheet(jsonData);
        resolve({ header, items, rawSheet: jsonData });
      } catch (err) {
        reject(new Error(`Ошибка парсинга файла заказа: ${(err as Error).message}`));
      }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл заказа'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Эвристический поиск шапки и данных заказа
 */
function parseOrderSheet(data: any[][]): { header: OrderHeader; items: OrderItem[] } {
  const header: OrderHeader = {
    supplier: '',
    buyer: '',
    receiver: '',
    warehouse: '',
    orderNumber: '',
    orderDate: '',
  };

  // Ищем строку с заголовками таблицы
  let headerRowIdx = -1;
  let colMap: Record<string, number> = {};

  for (let i = 0; i < Math.min(data.length, 30); i++) {
    const row = data[i].map((cell: any) => String(cell || '').toLowerCase().trim());
    
    // Ищем признаки шапки таблицы заказа
    const hasName = row.some(c => c.includes('наименование') || c.includes('товар'));
    const hasPrice = row.some(c => c.includes('цена'));
    const hasQty = row.some(c => c.includes('кол-во') || c.includes('количество'));
    
    if (hasName && (hasPrice || hasQty)) {
      headerRowIdx = i;
      
      // Определяем колонки
      for (let j = 0; j < row.length; j++) {
        const cell = row[j];
        if (cell.includes('№') || cell === 'n' || cell.includes('п/п') || cell.includes('поряд')) {
          colMap['rowNumber'] = j;
        } else if (cell.includes('штрихкод') || cell.includes('штрих') || cell.includes('баркод')) {
          colMap['barcode'] = j;
        } else if (cell.includes('наименование') || cell.includes('товар')) {
          colMap['name'] = j;
        } else if (cell.includes('квант') || cell.includes('упак')) {
          colMap['quant'] = j;
        } else if (cell.includes('кол-во') || cell.includes('количество')) {
          colMap['quantity'] = j;
        } else if (cell === 'ед.' || cell.includes('единиц') || cell === 'ед') {
          colMap['unit'] = j;
        } else if (cell.includes('цена') && !cell.includes('сумма')) {
          colMap['price'] = j;
        } else if (cell.includes('сумма') || cell.includes('итого')) {
          colMap['sum'] = j;
        }
      }
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('Не найдена шапка таблицы заказа (строка с "Наименование" и "Цена")');
  }

  // Извлекаем информацию из шапки (строки до таблицы)
  for (let i = 0; i < headerRowIdx; i++) {
    const row = data[i];
    const rowText = row.map((c: any) => String(c || '').toLowerCase().trim()).join(' ');
    
    if (rowText.includes('поставщик')) {
      const val = findValueAfterLabel(row, 'поставщик');
      if (val) header.supplier = val;
    }
    if (rowText.includes('покупатель')) {
      const val = findValueAfterLabel(row, 'покупатель');
      if (val) header.buyer = val;
    }
    if (rowText.includes('грузополучатель') || rowText.includes('грузо')) {
      const val = findValueAfterLabel(row, 'грузополучатель');
      if (val) header.receiver = val;
    }
    if (rowText.includes('склад')) {
      const val = findValueAfterLabel(row, 'склад');
      if (val) header.warehouse = val;
    }
    if (rowText.includes('заказ') && (rowText.includes('№') || rowText.includes('от'))) {
      const fullText = row.map((c: any) => String(c || '')).join(' ').trim();
      const numMatch = fullText.match(/№\s*(\S+)/);
      if (numMatch) header.orderNumber = numMatch[1];
      const dateMatch = fullText.match(/от\s+(.+?)(?:\s*$|\s+постав)/i);
      if (dateMatch) header.orderDate = dateMatch[1].trim();
    }
  }

  // Парсим строки данных
  const items: OrderItem[] = [];
  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every((c: any) => !c && c !== 0)) continue; // пустая строка
    
    const nameIdx = colMap['name'] ?? 2;
    const name = String(row[nameIdx] || '').trim();
    
    // Пропускаем итоговые строки
    const lowerName = name.toLowerCase();
    if (lowerName.includes('итого') || lowerName.includes('в том числе') || 
        lowerName.includes('ндс') || lowerName === '') continue;
    
    // Проверяем, есть ли хоть какие-то данные
    const priceIdx = colMap['price'];
    const qtyIdx = colMap['quantity'];
    
    if (!name && priceIdx === undefined && qtyIdx === undefined) continue;
    
    const item: OrderItem = {
      rowNumber: colMap['rowNumber'] !== undefined ? Number(row[colMap['rowNumber']]) || items.length + 1 : items.length + 1,
      barcode: String(row[colMap['barcode'] ?? 1] || '').trim(),
      name: name,
      quant: parsePrice(row[colMap['quant']]) ?? 1,
      quantity: parsePrice(row[qtyIdx]) ?? 0,
      unit: String(row[colMap['unit'] ?? (qtyIdx ? qtyIdx + 1 : 4)] || 'шт').trim(),
      price: parsePrice(row[priceIdx]) ?? 0,
      sum: parsePrice(row[colMap['sum']]) ?? 0,
    };
    
    if (item.name) {
      items.push(item);
    }
  }

  return { header, items };
}

/**
 * Поиск значения после метки в строке
 */
function findValueAfterLabel(row: any[], label: string): string {
  const lowerRow = row.map((c: any) => String(c || '').toLowerCase().trim());
  for (let i = 0; i < lowerRow.length; i++) {
    if (lowerRow[i].includes(label)) {
      // Значение обычно в следующей непустой ячейке
      for (let j = i + 1; j < lowerRow.length; j++) {
        const val = String(row[j] || '').trim();
        if (val && !val.toLowerCase().includes(label)) {
          return val;
        }
      }
    }
  }
  return '';
}

/**
 * Парсинг файла матрицы товаров
 */
export function parseMatrixFile(file: File): Promise<MatrixData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

        if (jsonData.length === 0) {
          reject(new Error('Файл матрицы пуст'));
          return;
        }

        const matrixData = parseMatrixSheet(jsonData);
        resolve(matrixData);
      } catch (err) {
        reject(new Error(`Ошибка парсинга файла матрицы: ${(err as Error).message}`));
      }
    };
    reader.onerror = () => reject(new Error('Не удалось прочитать файл матрицы'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Парсинг листа матрицы товаров
 */
function parseMatrixSheet(data: any[][]): MatrixData {
  let period = '';
  let contractor = '';
  
  // Ищем строку с названиями складов (шапка колонок)
  // Это строка, где есть названия подразделений с классами A/B/C
  let warehouseHeaderRow = -1;
  let priceSubheaderRow = -1;
  let nameColIdx = -1;
  const warehouseColumns: MatrixWarehouseColumn[] = [];
  
  // Сначала ищем строку с "Номенклатура" для определения колонки наименования
  for (let i = 0; i < Math.min(data.length, 20); i++) {
    const row = data[i].map((c: any) => String(c || '').trim());
    for (let j = 0; j < row.length; j++) {
      if (row[j].toLowerCase().includes('номенклатура')) {
        nameColIdx = j;
        break;
      }
    }
    if (nameColIdx >= 0) break;
  }
  
  // Если не нашли "Номенклатура", ищем первую колонку как номенклатуру
  if (nameColIdx < 0) {
    nameColIdx = 0;
  }

  // Ищем строку с заголовками складов
  for (let i = 0; i < Math.min(data.length, 15); i++) {
    const row = data[i];
    const rowStr = row.map((c: any) => String(c || '').trim());
    
    // Проверяем, есть ли в строке признаки складов (названия с классами)
    let warehouseCount = 0;
    const tempColumns: MatrixWarehouseColumn[] = [];
    
    for (let j = nameColIdx + 1; j < rowStr.length; j++) {
      const cell = rowStr[j];
      if (!cell) continue;
      
      // Проверяем, похоже ли это на название склада
      const { name, className } = extractWarehouseName(cell);
      if (name.length > 2 && !cell.toLowerCase().includes('цена') && 
          !cell.toLowerCase().includes('номенклатура') && 
          !cell.toLowerCase().includes('период') &&
          !cell.toLowerCase().includes('остаток')) {
        warehouseCount++;
        tempColumns.push({
          colIndex: j,
          name: name,
          className: className,
          fullName: cell,
        });
      }
    }
    
    // Если нашли хотя бы 2 склада — это строка заголовков
    if (warehouseCount >= 2) {
      warehouseHeaderRow = i;
      warehouseColumns.push(...tempColumns);
      
      // Проверяем следующую строку на подзаголовок "Цена"
      if (i + 1 < data.length) {
        const nextRow = data[i + 1].map((c: any) => String(c || '').toLowerCase().trim());
        if (nextRow.some(c => c.includes('цена'))) {
          priceSubheaderRow = i + 1;
        }
      }
      break;
    }
  }

  if (warehouseHeaderRow === -1) {
    throw new Error('Не найдены заголовки складов в матрице (строка с названиями подразделений)');
  }

  // Извлекаем информацию из шапки матрицы (период, контрагент)
  for (let i = 0; i < warehouseHeaderRow; i++) {
    const row = data[i];
    const rowText = row.map((c: any) => String(c || '')).join(' ');
    const rowTextLower = rowText.toLowerCase();
    
    if (rowTextLower.includes('период') || rowTextLower.includes('на конец')) {
      const dateMatch = rowText.match(/(\d{2}[./]\d{2}[./]\d{4})/);
      if (dateMatch) period = dateMatch[1];
      else {
        const periodMatch = rowText.match(/период[:\s]*(.+?)(?:\s*$)/i);
        if (periodMatch) period = periodMatch[1].trim();
      }
    }
    if (rowTextLower.includes('контрагент') || rowTextLower.includes('организация')) {
      const parts = rowText.split(/[:;]/);
      if (parts.length > 1) {
        contractor = parts[parts.length - 1].trim();
      }
    }
  }

  // Определяем строку начала данных
  const dataStartRow = (priceSubheaderRow >= 0 ? priceSubheaderRow : warehouseHeaderRow) + 1;

  // Парсим строки данных
  const items: MatrixItem[] = [];
  for (let i = dataStartRow; i < data.length; i++) {
    const row = data[i];
    if (!row || row.every((c: any) => !c && c !== 0)) continue;
    
    const name = String(row[nameColIdx] || '').trim();
    if (!name) continue;
    
    // Пропускаем итоговые строки
    const lowerName = name.toLowerCase();
    if (lowerName.includes('итого') || lowerName.includes('в том числе') ||
        lowerName.includes('ндс') || lowerName === '—' || lowerName === '-') continue;

    // Определяем, является ли строка групповым заголовком
    // Групповые строки обычно не имеют цен или имеют специфический формат
    const isGroup = isGroupRow(row, nameColIdx, warehouseColumns);

    // Извлекаем цены для каждого склада
    const prices: Record<string, number | null> = {};
    for (const wc of warehouseColumns) {
      const priceVal = parsePrice(row[wc.colIndex]);
      prices[wc.fullName] = priceVal;
    }

    items.push({
      name,
      isGroup,
      prices,
      rowNumber: i,
    });
  }

  const departments = warehouseColumns.map(wc => wc.fullName);

  return {
    period,
    contractor,
    departments,
    warehouseColumns,
    items,
    rawSheet: data,
  };
}

/**
 * Определение, является ли строка групповым заголовком
 */
function isGroupRow(row: any[], nameColIdx: number, warehouseColumns: MatrixWarehouseColumn[]): boolean {
  // Групповая строка: все цены пустые, но есть название
  let hasAnyPrice = false;
  for (const wc of warehouseColumns) {
    const val = parsePrice(row[wc.colIndex]);
    if (val !== null && val > 0) {
      hasAnyPrice = true;
      break;
    }
  }
  return !hasAnyPrice;
}
