/**
 * Таблица результатов сверки с фильтрами и поиском
 */

import React, { useState, useMemo } from 'react';
import { Search, Filter } from 'lucide-react';
import { ReconciliationResult, ReconciliationStatus } from '../types';
import { formatPrice, formatPercent } from '../utils/normalization';

interface ResultsTableProps {
  results: ReconciliationResult[];
}

const STATUS_CONFIG: Record<ReconciliationStatus, { label: string; color: string; bg: string }> = {
  'MATCH': { label: 'Совпадает', color: 'text-green-700', bg: 'bg-green-50' },
  'MISMATCH': { label: 'Расхождение', color: 'text-red-700', bg: 'bg-red-50' },
  'NOT_FOUND_IN_MATRIX': { label: 'Нет в матрице', color: 'text-gray-700', bg: 'bg-gray-100' },
  'WAREHOUSE_NOT_FOUND': { label: 'Склад не найден', color: 'text-orange-700', bg: 'bg-orange-50' },
  'FUZZY_MATCH': { label: 'Нечёткое', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  'NO_PRICE': { label: 'Нет цены', color: 'text-purple-700', bg: 'bg-purple-50' },
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'mismatch', label: 'Расхождения' },
  { value: 'match', label: 'Совпало' },
  { value: 'not_found', label: 'Нет в матрице' },
  { value: 'fuzzy', label: 'Нечёткие' },
  { value: 'no_price', label: 'Нет цены' },
];

export const ResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filteredResults = useMemo(() => {
    let filtered = results;

    // Фильтр по статусу
    switch (filter) {
      case 'mismatch':
        filtered = filtered.filter(r => r.status === 'MISMATCH');
        break;
      case 'match':
        filtered = filtered.filter(r => r.status === 'MATCH');
        break;
      case 'not_found':
        filtered = filtered.filter(r => r.status === 'NOT_FOUND_IN_MATRIX' || r.status === 'WAREHOUSE_NOT_FOUND');
        break;
      case 'fuzzy':
        filtered = filtered.filter(r => r.status === 'FUZZY_MATCH');
        break;
      case 'no_price':
        filtered = filtered.filter(r => r.status === 'NO_PRICE');
        break;
    }

    // Поиск по наименованию
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(r =>
        r.orderItem.name.toLowerCase().includes(searchLower) ||
        (r.matrixName && r.matrixName.toLowerCase().includes(searchLower))
      );
    }

    return filtered;
  }, [results, filter, search]);

  const getRowClass = (status: ReconciliationStatus): string => {
    switch (status) {
      case 'MISMATCH': return 'bg-red-50 hover:bg-red-100';
      case 'FUZZY_MATCH': return 'bg-yellow-50 hover:bg-yellow-100';
      case 'NOT_FOUND_IN_MATRIX': return 'bg-gray-50 hover:bg-gray-100';
      case 'NO_PRICE': return 'bg-purple-50 hover:bg-purple-100';
      case 'WAREHOUSE_NOT_FOUND': return 'bg-orange-50 hover:bg-orange-100';
      default: return 'hover:bg-green-50';
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Поиск по наименованию..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          >
            {FILTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Count */}
      <p className="text-sm text-gray-500">
        Показано: {filteredResults.length} из {results.length}
      </p>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-3 text-left font-semibold text-gray-600">№</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 min-w-[250px]">Наименование (заказ)</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Цена заказа</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Кол-во</th>
              <th className="px-3 py-3 text-left font-semibold text-gray-600 min-w-[250px]">Наименование (матрица)</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Цена матрицы</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Дельта ₽</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Дельта %</th>
              <th className="px-3 py-3 text-right font-semibold text-gray-600">Откл. сумма</th>
              <th className="px-3 py-3 text-center font-semibold text-gray-600">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredResults.map((r, idx) => {
              const statusConf = STATUS_CONFIG[r.status];
              return (
                <tr key={idx} className={`${getRowClass(r.status)} transition-colors`}>
                  <td className="px-3 py-2 text-gray-500">{r.orderItem.rowNumber}</td>
                  <td className="px-3 py-2 font-medium text-gray-800" title={r.orderItem.name}>
                    <span className="line-clamp-2">{r.orderItem.name}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{formatPrice(r.orderItem.price)}</td>
                  <td className="px-3 py-2 text-right">{r.orderItem.quantity}</td>
                  <td className="px-3 py-2 text-gray-600" title={r.matrixName || ''}>
                    <span className="line-clamp-2">{r.matrixName || '—'}</span>
                    {r.fuzzyScore !== null && (
                      <span className="text-xs text-yellow-600 ml-1">({r.fuzzyScore}%)</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.matrixPrice !== null ? formatPrice(r.matrixPrice) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${
                    r.delta !== null ? (r.delta > 0 ? 'text-red-600' : r.delta < 0 ? 'text-blue-600' : 'text-gray-500') : ''
                  }`}>
                    {r.delta !== null ? `${r.delta > 0 ? '+' : ''}${formatPrice(r.delta)}` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono ${
                    r.deltaPercent !== null ? (r.deltaPercent > 0 ? 'text-red-600' : r.deltaPercent < 0 ? 'text-blue-600' : '') : ''
                  }`}>
                    {r.deltaPercent !== null ? `${r.deltaPercent > 0 ? '+' : ''}${formatPercent(r.deltaPercent)}` : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-medium ${
                    r.sumDelta !== null ? (r.sumDelta > 0 ? 'text-red-600' : r.sumDelta < 0 ? 'text-blue-600' : '') : ''
                  }`}>
                    {r.sumDelta !== null ? `${r.sumDelta > 0 ? '+' : ''}${formatPrice(r.sumDelta)}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusConf.color} ${statusConf.bg}`}>
                      {statusConf.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredResults.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          Нет результатов по выбранным фильтрам
        </div>
      )}
    </div>
  );
};
