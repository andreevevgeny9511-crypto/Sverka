/**
 * Компонент истории сверок
 */

import React from 'react';
import { Clock, Trash2, Eye, X } from 'lucide-react';
import { HistoryEntry } from '../types';
import { formatPrice } from '../utils/normalization';

interface HistoryPanelProps {
  entries: HistoryEntry[];
  isOpen: boolean;
  onClose: () => void;
  onView: (entry: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
  entries,
  isOpen,
  onClose,
  onView,
  onDelete,
  onClear,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden m-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-bold text-gray-800">История сверок</h2>
            <span className="text-sm text-gray-400">({entries.length})</span>
          </div>
          <div className="flex items-center gap-2">
            {entries.length > 0 && (
              <button
                onClick={onClear}
                className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg"
              >
                Очистить всё
              </button>
            )}
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>История пуста</p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map(entry => (
                <div key={entry.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">
                        {new Date(entry.timestamp).toLocaleString('ru-RU')}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        📄 {entry.orderFileName} → {entry.matrixFileName}
                      </p>
                      <p className="text-xs text-gray-500">
                        Склад: {entry.summary.warehouse}
                      </p>
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="text-green-600">✓ {entry.summary.matched}</span>
                        <span className="text-red-600">✗ {entry.summary.mismatched}</span>
                        <span className="text-gray-500">? {entry.summary.notFound}</span>
                        <span className={`font-medium ${
                          entry.summary.totalDelta < 0 ? 'text-blue-600' : 
                          entry.summary.totalDelta > 0 ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          Δ {entry.summary.totalDelta > 0 ? '+' : ''}{formatPrice(entry.summary.totalDelta)} ₽
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1 ml-3">
                      <button
                        onClick={() => onView(entry)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Просмотреть"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
