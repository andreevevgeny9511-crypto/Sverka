/**
 * Компонент для корректировки цен в заказе и скачивания исправленного файла
 */

import React, { useState, useMemo } from 'react';
import { Download, Settings2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ReconciliationFull, ReconciliationResult } from '../types';
import { formatPrice } from '../utils/normalization';
import {
  CorrectionOptions,
  DEFAULT_CORRECTION_OPTIONS,
  generateCorrectedOrder,
  countCorrections,
  sumCorrections,
} from '../utils/correction';

interface CorrectionPanelProps {
  data: ReconciliationFull;
}

export const CorrectionPanel: React.FC<CorrectionPanelProps> = ({ data }) => {
  const [options, setOptions] = useState<CorrectionOptions>(DEFAULT_CORRECTION_OPTIONS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Подсчёт количества корректировок и суммы
  const stats = useMemo(() => {
    const effectiveOptions = options.mode === 'selected' 
      ? { ...options, selectedIndices }
      : options;
    
    return {
      count: countCorrections(data.results, effectiveOptions),
      sum: sumCorrections(data.results, effectiveOptions),
    };
  }, [data.results, options, selectedIndices]);

  // Обработка скачивания
  const handleDownload = () => {
    setError(null);
    try {
      const effectiveOptions = options.mode === 'selected'
        ? { ...options, selectedIndices }
        : options;
      
      if (effectiveOptions.mode === 'selected' && selectedIndices.size === 0) {
        setError('Выберите хотя бы одну позицию для корректировки');
        return;
      }

      generateCorrectedOrder(data, effectiveOptions);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Переключение выбора позиции
  const toggleSelection = (idx: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setSelectedIndices(newSet);
  };

  // Выбрать все расхождения
  const selectAllMismatches = () => {
    const newSet = new Set<number>();
    data.results.forEach((r, idx) => {
      if (r.status === 'MISMATCH' || (r.status === 'FUZZY_MATCH' && r.delta !== null && Math.abs(r.delta) > 0.01)) {
        newSet.add(idx);
      }
    });
    setSelectedIndices(newSet);
  };

  // Очистить выбор
  const clearSelection = () => {
    setSelectedIndices(new Set());
  };

  // Позиции для отображения (только те, которые можно скорректировать)
  const correctableItems = useMemo(() => {
    return data.results
      .map((r, idx) => ({ result: r, index: idx }))
      .filter(({ result }) => 
        result.matrixPrice !== null && 
        (result.status === 'MISMATCH' || result.status === 'FUZZY_MATCH')
      );
  }, [data.results]);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Корректировка цен</h2>
          <p className="text-sm text-gray-500 mt-1">
            Замените цены в заказе на эталонные из матрицы и скачайте исправленный файл
          </p>
        </div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <Settings2 className="w-4 h-4" />
          {showAdvanced ? 'Скрыть' : 'Настройки'}
        </button>
      </div>

      {/* Advanced settings */}
      {showAdvanced && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Режим корректировки</h3>
          
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="all_mismatches"
                checked={options.mode === 'all_mismatches'}
                onChange={() => setOptions({ ...options, mode: 'all_mismatches' })}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Все расхождения</p>
                <p className="text-xs text-gray-500">Заменить цены во всех позициях с расхождением</p>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="all_with_fuzzy"
                checked={options.mode === 'all_with_fuzzy'}
                onChange={() => setOptions({ ...options, mode: 'all_with_fuzzy' })}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Все расхождения + нечёткие совпадения</p>
                <p className="text-xs text-gray-500">Включить позиции с fuzzy-совпадением</p>
              </div>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="mode"
                value="selected"
                checked={options.mode === 'selected'}
                onChange={() => setOptions({ ...options, mode: 'selected' })}
                className="mt-1"
              />
              <div>
                <p className="text-sm font-medium text-gray-700">Выбранные позиции</p>
                <p className="text-xs text-gray-500">Вручную выбрать позиции для корректировки</p>
              </div>
            </label>
          </div>

          {/* Округление */}
          <div className="pt-3 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Округление цены
            </label>
            <select
              value={options.rounding}
              onChange={(e) => setOptions({ ...options, rounding: parseInt(e.target.value) })}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="0">Без округления</option>
              <option value="2">До копеек (0.01)</option>
              <option value="1">До десятых (0.1)</option>
            </select>
          </div>
        </div>
      )}

      {/* Selection mode - show items */}
      {options.mode === 'selected' && (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 flex items-center justify-between border-b">
            <p className="text-sm font-medium text-gray-700">
              Выберите позиции для корректировки ({selectedIndices.size} выбрано)
            </p>
            <div className="flex gap-2">
              <button
                onClick={selectAllMismatches}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Выбрать все расхождения
              </button>
              <button
                onClick={clearSelection}
                className="text-xs text-gray-600 hover:text-gray-700"
              >
                Очистить
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {correctableItems.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                Нет позиций для корректировки
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-10"></th>
                    <th className="px-3 py-2 text-left">Наименование</th>
                    <th className="px-3 py-2 text-right">Цена заказа</th>
                    <th className="px-3 py-2 text-right">Цена матрицы</th>
                    <th className="px-3 py-2 text-right">Дельта</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {correctableItems.map(({ result, index }) => (
                    <tr
                      key={index}
                      className={`cursor-pointer hover:bg-blue-50 ${
                        selectedIndices.has(index) ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => toggleSelection(index)}
                    >
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(index)}
                          onChange={() => toggleSelection(index)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2 text-gray-800">
                        <span className="line-clamp-1">{result.orderItem.name}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatPrice(result.orderItem.price)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {formatPrice(result.matrixPrice)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono font-medium ${
                        result.delta && result.delta > 0 ? 'text-red-600' : 'text-blue-600'
                      }`}>
                        {result.delta !== null ? `${result.delta > 0 ? '+' : ''}${formatPrice(result.delta)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="bg-blue-50 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-blue-700 font-medium">
            Будет скорректировано: {stats.count} {stats.count === 1 ? 'позиция' : stats.count < 5 ? 'позиции' : 'позиций'}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Сумма коррекции: {stats.sum > 0 ? '+' : ''}{formatPrice(stats.sum)} ₽
            {stats.sum < 0 && ' (занижение в заказе)'}
            {stats.sum > 0 && ' (завышение в заказе)'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-blue-600">Новая сумма заказа:</p>
          <p className="text-lg font-bold text-blue-800">
            {formatPrice(data.summary.totalOrderSum + stats.sum)} ₽
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Download button */}
      <button
        onClick={handleDownload}
        disabled={stats.count === 0}
        className="w-full px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-medium
          hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed
          flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-200"
      >
        <Download className="w-5 h-5" />
        Скачать исправленный заказ (XLSX)
      </button>

      <p className="text-xs text-gray-500 text-center">
        Файл будет содержать 3 листа: исправленный заказ, лог корректировок и сводку
      </p>
    </div>
  );
};
