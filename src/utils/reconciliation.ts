/**
 * Логика сверки цен заказа с эталонными ценами из матрицы
 */

import {
  OrderData,
  MatrixData,
  MatrixWarehouseColumn,
  ReconciliationResult,
  ReconciliationSummary,
  ReconciliationFull,
  AppSettings,
} from '../types';
import {
  normalizeText,
  normalizeWarehouse,
  extractWarehouseName,
  warehouseMatches,
  namesMatchExact,
  fuzzyMatch,
  formatPrice,
} from './normalization';

/**
 * Основная функция сверки (для одного заказа)
 */
export function reconcileSingle(
  orderData: OrderData,
  matrixData: MatrixData,
  settings: AppSettings,
  orderFileName: string,
  manualWarehouseColumn?: MatrixWarehouseColumn
): ReconciliationResult[] {
  // 1. Определяем целевой склад из заказа
  const orderWarehouse = orderData.header.warehouse;
  
  // 2. Находим соответствующую колонку в матрице
  let selectedColumn: MatrixWarehouseColumn | null = null;
  let warehouseNotFound = false;

  if (manualWarehouseColumn) {
    selectedColumn = manualWarehouseColumn;
  } else if (settings.autoWarehouseSelect && orderWarehouse) {
    selectedColumn = findWarehouseColumn(orderWarehouse, matrixData.warehouseColumns);
    if (!selectedColumn) {
      warehouseNotFound = true;
    }
  }

  // 3. Сверяем каждую позицию
  const results: ReconciliationResult[] = orderData.items.map(item => {
    return reconcileItem(item, matrixData, selectedColumn, settings, warehouseNotFound, orderFileName);
  });

  return results;
}

/**
 * Основная функция сверки (для нескольких заказов)
 */
export function reconcile(
  ordersData: OrderData[],
  matrixData: MatrixData,
  settings: AppSettings,
  orderFileNames: string[],
  manualWarehouseColumn?: MatrixWarehouseColumn
): ReconciliationFull {
  // Сверяем каждый заказ
  const allResults: ReconciliationResult[] = [];
  
  ordersData.forEach((orderData, idx) => {
    const orderFileName = orderFileNames[idx] || `Заказ ${idx + 1}`;
    const results = reconcileSingle(orderData, matrixData, settings, orderFileName, manualWarehouseColumn);
    allResults.push(...results);
  });

  // Используем первый заказ для сводки
  const firstOrder = ordersData[0];
  const orderWarehouse = firstOrder?.header.warehouse || '';
  
  // Находим колонку для сводки
  let selectedColumn: MatrixWarehouseColumn | null = null;
  let warehouseNotFound = false;
  
  if (manualWarehouseColumn) {
    selectedColumn = manualWarehouseColumn;
  } else if (settings.autoWarehouseSelect && orderWarehouse) {
    selectedColumn = findWarehouseColumn(orderWarehouse, matrixData.warehouseColumns);
    if (!selectedColumn) {
      warehouseNotFound = true;
    }
  }

  // Формируем сводку
  const summary = buildSummary(allResults, orderWarehouse, selectedColumn, matrixData, warehouseNotFound);

  return {
    results: allResults,
    summary,
    orderData: firstOrder,
    matrixData,
    selectedColumn,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Поиск колонки склада в матрице
 */
function findWarehouseColumn(
  orderWarehouse: string,
  columns: MatrixWarehouseColumn[]
): MatrixWarehouseColumn | null {
  const normOrder = normalizeWarehouse(orderWarehouse);
  
  // 1. Точное совпадение (без класса)
  for (const col of columns) {
    if (normalizeWarehouse(col.name) === normOrder) {
      return col;
    }
  }
  
  // 2. Совпадение по началу (колонка начинается с названия склада)
  for (const col of columns) {
    if (warehouseMatches(orderWarehouse, col.name)) {
      return col;
    }
  }
  
  // 3. Обратное совпадение (название склада начинается с названия колонки)
  for (const col of columns) {
    const normCol = normalizeWarehouse(col.name);
    if (normOrder.startsWith(normCol) || normCol.startsWith(normOrder)) {
      return col;
    }
  }
  
  return null;
}

/**
 * Сверка одной позиции заказа
 */
function reconcileItem(
  item: { name: string; price: number; sum: number; quantity: number },
  matrixData: MatrixData,
  selectedColumn: MatrixWarehouseColumn | null,
  settings: AppSettings,
  warehouseNotFound: boolean,
  orderFileName: string
): ReconciliationResult {
  const baseResult: ReconciliationResult = {
    orderItem: item as any,
    orderFileName,
    status: 'NOT_FOUND_IN_MATRIX',
    matrixName: null,
    matrixPrice: null,
    delta: null,
    deltaPercent: null,
    orderSum: item.sum || (item.price * item.quantity),
    matrixSum: null,
    sumDelta: null,
    fuzzyScore: null,
    note: '',
  };

  // Если склад не найден в матрице
  if (warehouseNotFound || !selectedColumn) {
    return { ...baseResult, status: 'WAREHOUSE_NOT_FOUND', note: 'Склад не найден в матрице' };
  }

  // Ищем номенклатуру в матрице
  const match = findMatrixItem(item.name, matrixData.items, settings);

  if (!match) {
    return { ...baseResult, status: 'NOT_FOUND_IN_MATRIX', note: 'Позиция не найдена в матрице' };
  }

  const { matrixItem, score } = match;

  // Получаем цену для выбранного склада
  const matrixPrice = matrixItem.prices[selectedColumn.fullName] ?? null;

  if (matrixPrice === null) {
    return {
      ...baseResult,
      status: 'NO_PRICE',
      matrixName: matrixItem.name,
      fuzzyScore: score < 100 ? score : null,
      note: 'Цена для данного склада отсутствует в матрице',
    };
  }

  // Считаем дельту
  const orderPrice = item.price;
  const delta = orderPrice - matrixPrice;
  const deltaPercent = matrixPrice !== 0 ? (delta / matrixPrice) * 100 : (delta !== 0 ? 100 : 0);
  const quantity = item.quantity || 1;
  const matrixSum = matrixPrice * quantity;
  const sumDelta = (item.sum || orderPrice * quantity) - matrixSum;

  // Определяем статус
  const isMatch = Math.abs(delta) <= settings.tolerance;
  
  let status: ReconciliationResult['status'];
  let note = '';
  
  if (isMatch) {
    if (score !== null && score < 100 && score >= settings.fuzzyThreshold) {
      status = 'FUZZY_MATCH';
      note = `Нечёткое совпадение (score: ${score}%)`;
    } else {
      status = 'MATCH';
      note = 'Цена совпадает';
    }
  } else {
    if (score !== null && score < 100 && score >= settings.fuzzyThreshold) {
      status = 'FUZZY_MATCH';
      note = `Нечёткое совпадение (score: ${score}%), цена расходится`;
    } else {
      status = 'MISMATCH';
      note = `Расхождение: ${delta > 0 ? '+' : ''}${formatPrice(delta)} руб.`;
    }
  }

  return {
    orderItem: item as any,
    orderFileName,
    status,
    matrixName: matrixItem.name,
    matrixPrice,
    delta,
    deltaPercent,
    orderSum: item.sum || orderPrice * quantity,
    matrixSum,
    sumDelta,
    fuzzyScore: score < 100 ? score : null,
    note,
  };
}

/**
 * Поиск позиции в матрице по наименованию
 */
function findMatrixItem(
  orderName: string,
  matrixItems: MatrixData['items'],
  settings: AppSettings
): { matrixItem: MatrixData['items'][0]; score: number } | null {
  // Приоритет 1: Точное совпадение (только листовые строки)
  for (const item of matrixItems) {
    if (item.isGroup) continue;
    if (namesMatchExact(orderName, item.name)) {
      return { matrixItem: item, score: 100 };
    }
  }

  // Приоритет 2: Fuzzy-сопоставление (если включено)
  if (settings.matchMode === 'exact_and_fuzzy') {
    let bestMatch: { matrixItem: MatrixData['items'][0]; score: number } | null = null;
    let bestScore = 0;

    for (const item of matrixItems) {
      if (item.isGroup) continue;
      const score = fuzzyMatch(orderName, item.name);
      if (score >= settings.fuzzyThreshold && score > bestScore) {
        bestScore = score;
        bestMatch = { matrixItem: item, score };
      }
    }

    if (bestMatch) return bestMatch;
  }

  return null;
}

/**
 * Формирование сводки
 */
function buildSummary(
  results: ReconciliationResult[],
  warehouse: string,
  selectedColumn: MatrixWarehouseColumn | null,
  matrixData: MatrixData,
  warehouseNotFound: boolean
): ReconciliationSummary {
  let matched = 0;
  let mismatched = 0;
  let notFound = 0;
  let fuzzyMatched = 0;
  let noPrice = 0;
  let totalDelta = 0;
  let totalOrderSum = 0;
  let totalMatrixSum = 0;
  let notFoundSum = 0;

  for (const r of results) {
    totalOrderSum += r.orderSum;
    
    switch (r.status) {
      case 'MATCH':
        matched++;
        totalDelta += r.sumDelta || 0;
        totalMatrixSum += r.matrixSum || 0;
        break;
      case 'MISMATCH':
        mismatched++;
        totalDelta += r.sumDelta || 0;
        totalMatrixSum += r.matrixSum || 0;
        break;
      case 'FUZZY_MATCH':
        fuzzyMatched++;
        if (r.matrixPrice !== null) {
          totalDelta += r.sumDelta || 0;
          totalMatrixSum += r.matrixSum || 0;
        }
        break;
      case 'NOT_FOUND_IN_MATRIX':
        notFound++;
        notFoundSum += r.orderSum;
        break;
      case 'NO_PRICE':
        noPrice++;
        notFoundSum += r.orderSum;
        break;
      case 'WAREHOUSE_NOT_FOUND':
        notFound++;
        notFoundSum += r.orderSum;
        break;
    }
  }

  return {
    warehouse,
    matrixColumn: selectedColumn?.fullName || 'не выбран',
    matrixPeriod: matrixData.period,
    totalItems: results.length,
    matched,
    mismatched,
    notFound,
    fuzzyMatched,
    noPrice,
    warehouseNotFound,
    totalDelta,
    totalOrderSum,
    totalMatrixSum,
    notFoundSum,
  };
}
