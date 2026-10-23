/**
 * Компонент сводки результатов сверки
 */

import React from 'react';
import { CheckCircle, XCircle, AlertTriangle, HelpCircle, DollarSign, TrendingDown } from 'lucide-react';
import { ReconciliationSummary } from '../types';
import { formatPrice } from '../utils/normalization';

interface SummaryProps {
  summary: ReconciliationSummary;
}

export const Summary: React.FC<SummaryProps> = ({ summary }) => {
  return (
    <div className="space-y-4">
      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-600 font-medium">Склад из заказа</p>
          <p className="text-sm font-bold text-blue-800 mt-1">{summary.warehouse || '—'}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-xs text-indigo-600 font-medium">Колонка матрицы</p>
          <p className="text-sm font-bold text-indigo-800 mt-1">{summary.matrixColumn}</p>
        </div>
        <div className="bg-violet-50 rounded-xl p-4">
          <p className="text-xs text-violet-600 font-medium">Период матрицы</p>
          <p className="text-sm font-bold text-violet-800 mt-1">{summary.matrixPeriod || '—'}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          icon={<CheckCircle className="w-5 h-5 text-green-600" />}
          label="Совпало"
          value={summary.matched}
          color="green"
        />
        <StatCard
          icon={<XCircle className="w-5 h-5 text-red-600" />}
          label="Расхождения"
          value={summary.mismatched}
          color="red"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5 text-yellow-600" />}
          label="Нечёткие"
          value={summary.fuzzyMatched}
          color="yellow"
        />
        <StatCard
          icon={<HelpCircle className="w-5 h-5 text-gray-600" />}
          label="Нет в матрице"
          value={summary.notFound}
          color="gray"
        />
        <StatCard
          icon={<HelpCircle className="w-5 h-5 text-purple-600" />}
          label="Нет цены"
          value={summary.noPrice}
          color="purple"
        />
        <StatCard
          icon={<DollarSign className="w-5 h-5 text-blue-600" />}
          label="Всего позиций"
          value={summary.totalItems}
          color="blue"
        />
      </div>

      {/* Financial summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Финансовые итоги</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Сумма по заказу</p>
            <p className="text-lg font-bold text-gray-800">{formatPrice(summary.totalOrderSum)} ₽</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Сумма по матрице</p>
            <p className="text-lg font-bold text-gray-800">{formatPrice(summary.totalMatrixSum)} ₽</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Суммарное отклонение</p>
            <p className={`text-lg font-bold ${
              summary.totalDelta > 0 ? 'text-red-600' : summary.totalDelta < 0 ? 'text-blue-600' : 'text-green-600'
            }`}>
              {summary.totalDelta > 0 ? '+' : ''}{formatPrice(summary.totalDelta)} ₽
            </p>
            {summary.totalDelta < 0 && (
              <p className="text-xs text-blue-500 flex items-center gap-1 mt-0.5">
                <TrendingDown className="w-3 h-3" /> Занижение в заказе
              </p>
            )}
            {summary.totalDelta > 0 && (
              <p className="text-xs text-red-500 mt-0.5">Завышение в заказе</p>
            )}
          </div>
          <div>
            <p className="text-xs text-gray-500">Сумма без эталона</p>
            <p className="text-lg font-bold text-gray-500">{formatPrice(summary.notFoundSum)} ₽</p>
            <p className="text-xs text-gray-400 mt-0.5">Не включено в отклонение</p>
          </div>
        </div>
      </div>

      {/* Warning */}
      {summary.warehouseNotFound && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-orange-800">Склад не найден в матрице</p>
            <p className="text-xs text-orange-600 mt-1">
              Склад «{summary.warehouse}» не найден среди колонок матрицы. 
              Выберите колонку вручную из выпадающего списка.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value, color }) => {
  const bgMap: Record<string, string> = {
    green: 'bg-green-50 border-green-200',
    red: 'bg-red-50 border-red-200',
    yellow: 'bg-yellow-50 border-yellow-200',
    gray: 'bg-gray-50 border-gray-200',
    purple: 'bg-purple-50 border-purple-200',
    blue: 'bg-blue-50 border-blue-200',
  };

  return (
    <div className={`rounded-xl border p-3 ${bgMap[color] || 'bg-gray-50 border-gray-200'}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-gray-600">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
    </div>
  );
};
