/**
 * Главный компонент приложения АТЛАС — сверка цен
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  History,
  FileSpreadsheet,
  FileText,
  Braces,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react';
import { FileUpload } from './components/FileUpload';
import { SettingsPanel } from './components/SettingsPanel';
import { ResultsTable } from './components/ResultsTable';
import { Summary } from './components/Summary';
import { HistoryPanel } from './components/HistoryPanel';
import {
  AppSettings,
  DEFAULT_SETTINGS,
  ReconciliationFull,
  HistoryEntry,
  MatrixWarehouseColumn,
  OrderData,
  MatrixData,
} from './types';
import { parseOrderFile, parseMatrixFile } from './utils/parser';
import { reconcile } from './utils/reconciliation';
import { exportToXlsx, exportToCSV, exportToJSON } from './utils/export';
import { loadSettings, saveSettings, loadHistory, saveToHistory, deleteFromHistory, clearHistory } from './utils/storage';

type AppPage = 'main' | 'results';

const MAX_ORDERS = 5;

function App() {
  // State
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [matrixFile, setMatrixFile] = useState<File | null>(null);
  const [orderFiles, setOrderFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationFull | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [manualColumn, setManualColumn] = useState<MatrixWarehouseColumn | null>(null);
  const [page, setPage] = useState<AppPage>('main');
  
  // Cached parsed data
  const [parsedOrderDatas, setParsedOrderDatas] = useState<OrderData[]>([]);
  const [parsedMatrixData, setParsedMatrixData] = useState<MatrixData | null>(null);
  const [parsedOrderFileNames, setParsedOrderFileNames] = useState<string[]>([]);

  // Load settings and history on mount
  useEffect(() => {
    setSettings(loadSettings());
    setHistory(loadHistory());
  }, []);

  // Save settings when changed
  const handleSettingsChange = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  }, []);

  // Add order file
  const handleAddOrderFile = useCallback((file: File) => {
    if (orderFiles.length >= MAX_ORDERS) {
      setError(`Максимум ${MAX_ORDERS} файлов заказов`);
      return;
    }
    // Проверка на дубликаты
    if (orderFiles.some(f => f.name === file.name && f.size === file.size)) {
      setError(`Файл "${file.name}" уже добавлен`);
      return;
    }
    setError(null);
    setOrderFiles(prev => [...prev, file]);
  }, [orderFiles]);

  // Remove order file
  const handleRemoveOrderFile = useCallback((index: number) => {
    setOrderFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Clear all order files
  const handleClearOrderFiles = useCallback(() => {
    setOrderFiles([]);
  }, []);

  // Run reconciliation
  const handleReconcile = useCallback(async () => {
    if (!matrixFile) {
      setError('Загрузите файл матрицы');
      return;
    }
    if (orderFiles.length === 0) {
      setError('Загрузите хотя бы один файл заказа');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Парсим матрицу
      const matrixData = await parseMatrixFile(matrixFile);
      setParsedMatrixData(matrixData);

      // Парсим все заказы
      const orderDatas: OrderData[] = [];
      const orderFileNames: string[] = [];
      
      for (const file of orderFiles) {
        const orderData = await parseOrderFile(file);
        orderDatas.push(orderData);
        orderFileNames.push(file.name);
      }
      
      setParsedOrderDatas(orderDatas);
      setParsedOrderFileNames(orderFileNames);

      // Выполняем сверку
      const reconciliationResult = reconcile(
        orderDatas, 
        matrixData, 
        settings, 
        orderFileNames,
        manualColumn || undefined
      );
      
      setResult(reconciliationResult);
      setPage('results');

      // Save to history
      const historyEntry: HistoryEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        orderFileName: orderFileNames.join(', '),
        matrixFileName: matrixFile.name,
        summary: reconciliationResult.summary,
        results: reconciliationResult.results,
      };
      saveToHistory(historyEntry);
      setHistory(loadHistory());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  }, [matrixFile, orderFiles, settings, manualColumn]);

  // Re-run with manual column selection
  const handleSelectManualColumn = useCallback((colFullName: string) => {
    if (!parsedOrderDatas.length || !parsedMatrixData) return;
    const col = parsedMatrixData.warehouseColumns.find((wc) => wc.fullName === colFullName);
    if (col) {
      setManualColumn(col);
      const reconciliationResult = reconcile(
        parsedOrderDatas, 
        parsedMatrixData, 
        settings, 
        parsedOrderFileNames,
        col
      );
      setResult(reconciliationResult);
    }
  }, [parsedOrderDatas, parsedMatrixData, parsedOrderFileNames, settings]);

  // Export handlers
  const handleExport = useCallback((format: 'xlsx' | 'csv' | 'json') => {
    if (!result) return;
    switch (format) {
      case 'xlsx': exportToXlsx(result); break;
      case 'csv': exportToCSV(result); break;
      case 'json': exportToJSON(result); break;
    }
  }, [result]);

  // View history entry
  const handleViewHistory = useCallback((entry: HistoryEntry) => {
    const restoredResult: ReconciliationFull = {
      results: entry.results,
      summary: entry.summary,
      orderData: { header: { supplier: '', buyer: '', receiver: '', warehouse: entry.summary.warehouse, orderNumber: '', orderDate: '' }, items: [], rawSheet: [] },
      orderDatas: [],
      orderFileNames: [entry.orderFileName],
      matrixData: { period: entry.summary.matrixPeriod, contractor: '', departments: [], warehouseColumns: [], items: [], rawSheet: [] },
      selectedColumn: null,
      timestamp: entry.timestamp,
    };
    setResult(restoredResult);
    setPage('results');
    setShowHistory(false);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-800">АТЛАС</h1>
                <p className="text-xs text-gray-500 -mt-0.5">Сверка цен заказов с матрицей товаров</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(true)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="История"
              >
                <History className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="Настройки"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {page === 'main' && (
          <div className="space-y-8">
            {/* Upload section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-6">Загрузка файлов</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Матрица — слева */}
                <FileUpload
                  label="Матрица товаров"
                  description="Файл с эталонными ценами"
                  file={matrixFile}
                  onFileSelect={setMatrixFile}
                  onClear={() => setMatrixFile(null)}
                  maxSizeMB={settings.maxFileSizeMB}
                  showGoogleDrive
                />
                
                {/* Заказы — справа */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-semibold text-gray-700">
                      Заказы поставщикам
                    </label>
                    <span className="text-xs text-gray-400">
                      {orderFiles.length} / {MAX_ORDERS}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Загрузите до {MAX_ORDERS} файлов заказов для сверки
                  </p>
                  
                  {/* Список загруженных заказов */}
                  {orderFiles.length > 0 && (
                    <div className="space-y-2">
                      {orderFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2"
                        >
                          <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                          <span className="text-sm text-green-800 flex-1 truncate">
                            {file.name}
                          </span>
                          <span className="text-xs text-green-600">
                            {(file.size / 1024).toFixed(0)} КБ
                          </span>
                          <button
                            onClick={() => handleRemoveOrderFile(idx)}
                            className="p-0.5 rounded hover:bg-red-100 text-red-500"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Кнопка добавления */}
                  {orderFiles.length < MAX_ORDERS && (
                    <label className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                      <Plus className="w-4 h-4 text-blue-600" />
                      <span className="text-sm text-blue-600 font-medium">
                        {orderFiles.length === 0 ? 'Загрузить файл заказа' : 'Добавить ещё заказ'}
                      </span>
                      <input
                        type="file"
                        accept=".xlsx,.xls"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleAddOrderFile(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                  )}
                  
                  {orderFiles.length > 1 && (
                    <button
                      onClick={handleClearOrderFiles}
                      className="text-xs text-gray-500 hover:text-red-600"
                    >
                      Очистить все заказы
                    </button>
                  )}
                </div>
              </div>

              {/* Action button */}
              <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
                <p className="text-sm text-gray-500">
                  {matrixFile && orderFiles.length > 0 ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-4 h-4" /> 
                      Готово к сверке: матрица + {orderFiles.length} {orderFiles.length === 1 ? 'заказ' : orderFiles.length < 5 ? 'заказа' : 'заказов'}
                    </span>
                  ) : (
                    'Загрузите матрицу и хотя бы один заказ'
                  )}
                </p>
                <button
                  onClick={handleReconcile}
                  disabled={!matrixFile || orderFiles.length === 0 || isProcessing}
                  className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium 
                    hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center gap-2 transition-all shadow-lg shadow-blue-200"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Обработка...
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      Выполнить сверку
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Ошибка</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">Как это работает</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold text-sm">1</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Загрузите файлы</p>
                    <p className="text-xs text-gray-500 mt-1">Матрицу товаров и до 5 файлов заказов (.xlsx/.xls)</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold text-sm">2</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Автоматическая сверка</p>
                    <p className="text-xs text-gray-500 mt-1">Система сопоставит цены из всех заказов с эталонными</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold text-sm">3</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Результат и экспорт</p>
                    <p className="text-xs text-gray-500 mt-1">Просмотр расхождений с фильтрами, экспорт в XLSX/CSV/JSON</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {page === 'results' && result && (
          <div className="space-y-6">
            {/* Back button + Export */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <button
                onClick={() => setPage('main')}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                ← Назад к загрузке
              </button>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Экспорт:</span>
                <button
                  onClick={() => handleExport('xlsx')}
                  className="px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4" /> XLSX
                </button>
                <button
                  onClick={() => handleExport('csv')}
                  className="px-3 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 flex items-center gap-1 transition-colors"
                >
                  <FileText className="w-4 h-4" /> CSV
                </button>
                <button
                  onClick={() => handleExport('json')}
                  className="px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center gap-1 transition-colors"
                >
                  <Braces className="w-4 h-4" /> JSON
                </button>
              </div>
            </div>

            {/* Summary */}
            <Summary summary={result.summary} />

            {/* Warehouse column selector (if not found) */}
            {result.summary.warehouseNotFound && parsedMatrixData && (
              <div className="bg-white rounded-xl border border-orange-200 p-4">
                <h3 className="text-sm font-semibold text-orange-800 mb-2">
                  ⚠️ Склад не найден — выберите колонку вручную
                </h3>
                <p className="text-xs text-orange-600 mb-3">
                  Склад «{result.summary.warehouse}» не найден среди колонок матрицы. 
                  Выберите нужную колонку из списка ниже:
                </p>
                <select
                  onChange={(e) => handleSelectManualColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500"
                  defaultValue=""
                >
                  <option value="" disabled>— Выберите склад —</option>
                  {parsedMatrixData.warehouseColumns.map((wc) => (
                    <option key={wc.fullName} value={wc.fullName}>
                      {wc.fullName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Results table */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Результаты сверки</h2>
              <ResultsTable results={result.results} orderFileNames={result.orderFileNames} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-gray-400">
            АТЛАС — Сверка цен заказов с эталонной матрицей товаров
          </p>
        </div>
      </footer>

      {/* Settings modal */}
      <SettingsPanel
        settings={settings}
        onSettingsChange={handleSettingsChange}
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />

      {/* History modal */}
      <HistoryPanel
        entries={history}
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        onView={handleViewHistory}
        onDelete={(id) => {
          deleteFromHistory(id);
          setHistory(loadHistory());
        }}
        onClear={() => {
          clearHistory();
          setHistory([]);
        }}
      />
    </div>
  );
}

export default App;
