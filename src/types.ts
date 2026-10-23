/**
 * Типы данных для сервиса сверки цен
 */

export interface AppSettings {
  tolerance: number;
  fuzzyThreshold: number;
  matchMode: 'exact' | 'exact_and_fuzzy';
  autoWarehouseSelect: boolean;
  considerVat: boolean;
  maxFileSizeMB: number;
  language: 'ru' | 'en';
  historyEnabled: boolean;
  historyDays: number;
  defaultExport: 'xlsx' | 'csv' | 'json';
}

export const DEFAULT_SETTINGS: AppSettings = {
  tolerance: 0.01,
  fuzzyThreshold: 90,
  matchMode: 'exact_and_fuzzy',
  autoWarehouseSelect: true,
  considerVat: false,
  maxFileSizeMB: 20,
  language: 'ru',
  historyEnabled: true,
  historyDays: 30,
  defaultExport: 'xlsx',
};

export interface OrderHeader {
  supplier: string;
  buyer: string;
  receiver: string;
  warehouse: string;
  orderNumber: string;
  orderDate: string;
}

export interface OrderItem {
  rowNumber: number;
  barcode: string;
  name: string;
  quant: number;
  quantity: number;
  unit: string;
  price: number;
  sum: number;
}

export interface OrderData {
  header: OrderHeader;
  items: OrderItem[];
  rawSheet: any[][];
}

export interface MatrixWarehouseColumn {
  colIndex: number;
  name: string;
  className: string;
  fullName: string;
}

export interface MatrixItem {
  name: string;
  isGroup: boolean;
  prices: Record<string, number | null>;
  rowNumber: number;
}

export interface MatrixData {
  period: string;
  contractor: string;
  departments: string[];
  warehouseColumns: MatrixWarehouseColumn[];
  items: MatrixItem[];
  rawSheet: any[][];
}

export type ReconciliationStatus =
  | 'MATCH'
  | 'MISMATCH'
  | 'NOT_FOUND_IN_MATRIX'
  | 'WAREHOUSE_NOT_FOUND'
  | 'FUZZY_MATCH'
  | 'NO_PRICE';

export interface ReconciliationResult {
  orderItem: OrderItem;
  orderFileName: string;
  status: ReconciliationStatus;
  matrixName: string | null;
  matrixPrice: number | null;
  delta: number | null;
  deltaPercent: number | null;
  orderSum: number;
  matrixSum: number | null;
  sumDelta: number | null;
  fuzzyScore: number | null;
  note: string;
}

export interface ReconciliationSummary {
  warehouse: string;
  matrixColumn: string;
  matrixPeriod: string;
  totalItems: number;
  matched: number;
  mismatched: number;
  notFound: number;
  fuzzyMatched: number;
  noPrice: number;
  warehouseNotFound: boolean;
  totalDelta: number;
  totalOrderSum: number;
  totalMatrixSum: number;
  notFoundSum: number;
}

export interface ReconciliationFull {
  results: ReconciliationResult[];
  summary: ReconciliationSummary;
  orderData: OrderData;
  matrixData: MatrixData;
  selectedColumn: MatrixWarehouseColumn | null;
  timestamp: string;
  orderFileName: string;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  orderFileName: string;
  matrixFileName: string;
  summary: ReconciliationSummary;
  results: ReconciliationResult[];
}
