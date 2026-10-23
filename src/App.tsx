/**
 * Главный компонент приложения АТЛАС — Сверка цен
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
import { exportToXlsx, exportToCSV, exportToJSON, exportOrderWithMatrixPrices } from './utils/export';
import { loadSettings, saveSettings, loadHistory, saveToHistory, deleteFromHistory, clearHistory } from './utils/storage';

type AppPage = 'main' | 'results';

function App() {
  // State
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [orderFile, setOrderFile] = useState<File | null>(null);
  const [matrixFile, setMatrixFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationFull | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [manualColumn, setManualColumn] = useState<MatrixWarehouseColumn | null>(null);
  const [page, setPage] = useState<AppPage>('main');
  
  // Cached parsed data for re-running with different column
  const [parsedOrderData, setParsedOrderData] = useState<OrderData | null>(null);
  const [parsedMatrixData, setParsedMatrixData] = useState<MatrixData | null>(null);

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

  // Run reconciliation
  const handleReconcile = useCallback(async () => {
    if (!orderFile || !matrixFile) {
      setError('Загрузите оба файла');
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const [orderData, matrixData] = await Promise.all([
        parseOrderFile(orderFile),
        parseMatrixFile(matrixFile),
      ]);

      setParsedOrderData(orderData);
      setParsedMatrixData(matrixData);

      const reconciliationResult = reconcile(orderData, matrixData, settings, orderFile.name, manualColumn || undefined);
      setResult(reconciliationResult);
      setPage('results');

      // Save to history
      const historyEntry: HistoryEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        orderFileName: orderFile.name,
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
  }, [orderFile, matrixFile, settings, manualColumn]);

  // Re-run with manual column selection
  const handleSelectManualColumn = useCallback((colFullName: string) => {
    if (!parsedOrderData || !parsedMatrixData) return;
    const col = parsedMatrixData.warehouseColumns.find((wc) => wc.fullName === colFullName);
    if (col) {
      setManualColumn(col);
      const reconciliationResult = reconcile(parsedOrderData, parsedMatrixData, settings, orderFile?.name || '', col);
      setResult(reconciliationResult);
    }
  }, [parsedOrderData, parsedMatrixData, settings, orderFile]);

  // Export handlers
  const handleExport = useCallback((format: 'xlsx' | 'csv' | 'json') => {
    if (!result) return;
    switch (format) {
      case 'xlsx': exportToXlsx(result); break;
      case 'csv': exportToCSV(result); break;
      case 'json': exportToJSON(result); break;
    }
  }, [result]);

  // Export order with matrix prices
  const handleExportOrderWithMatrixPrices = useCallback(() => {
    if (!result) return;
    exportOrderWithMatrixPrices(result);
  }, [result]);

  // View history entry
  const handleViewHistory = useCallback((entry: HistoryEntry) => {
    const restoredResult: ReconciliationFull = {
      results: entry.results,
      summary: entry.summary,
      orderData: { header: { supplier: '', buyer: '', receiver: '', warehouse: entry.summary.warehouse, orderNumber: '', orderDate: '' }, items: [], rawSheet: [] },
      matrixData: { period: entry.summary.matrixPeriod, contractor: '', departments: [], warehouseColumns: [], items: [], rawSheet: [] },
      selectedColumn: null,
      timestamp: entry.timestamp,
      orderFileName: entry.orderFileName,
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
                <p className="text-xs text-gray-500 -mt-0.5">Сверка цен заказа с матрицей</p>
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
          <div className="space-y-6">
            {/* Upload section - two columns */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-6">Загрузка файлов</h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left column: Matrix */}
                <FileUpload
                  label="Матрица товаров"
                  description="Файл с эталонными ценами"
                  file={matrixFile}
                  onFileSelect={setMatrixFile}
                  onClear={() => setMatrixFile(null)}
                  maxSizeMB={settings.maxFileSizeMB}
                  showGoogleDrive
                />

                {/* Right column: Order */}
                <FileUpload
                  label="Заказ поставщику"
                  description="Файл заказа с ценами для сверки"
                  file={orderFile}
                  onFileSelect={setOrderFile}
                  onClear={() => setOrderFile(null)}
                  maxSizeMB={settings.maxFileSizeMB}
                  showGoogleDrive
                />
              </div>

              {/* Action button */}
              <div className="mt-6 flex items-center justify-between flex-wrap gap-4">
                <p className="text-sm text-gray-500">
                  {orderFile && matrixFile ? (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-4 h-4" /> 
                      Оба файла загружены — готово к сверке
                    </span>
                  ) : (
                    'Загрузите оба файла для начала сверки'
                  )}
                </p>
                <button
                  onClick={handleReconcile}
                  disabled={!orderFile || !matrixFile || isProcessing}
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
                    <p className="text-xs text-gray-500 mt-1">Матрицу товаров и файл заказа (.xlsx/.xls)</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold text-sm">2</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Автоматическая сверка</p>
                    <p className="text-xs text-gray-500 mt-1">Система сопоставит цены заказа с эталонными из матрицы</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-blue-600 font-bold text-sm">3</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-700">Результат и экспорт</p>
                    <p className="text-xs text-gray-500 mt-1">Просмотр расхождений с фильтрами, экспорт в XLSX, CSV или JSON</p>
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
                <button
                  onClick={() => handleExportOrderWithMatrixPrices()}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1 transition-colors"
                  title="Экспорт заказа с ценами из матрицы"
                >
                  <FileText className="w-4 h-4" /> Заказ с эталонными ценами
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
              <ResultsTable results={result.results} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-gray-400">
            АТЛАС — Сервис сверки цен заказа с эталонной матрицей товаров
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
