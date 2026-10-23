/**
 * Компонент настроек сервиса
 */

import React from 'react';
import { Settings as SettingsIcon, X } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsPanelProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onSettingsChange,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-gray-600" />
            <h2 className="text-lg font-bold text-gray-800">Настройки</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Сравнение цен */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Сравнение цен</legend>
            
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Допуск сравнения (руб.)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={settings.tolerance}
                onChange={(e) => updateSetting('tolerance', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Разница в пределах допуска считается совпадением</p>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Порог fuzzy-сопоставления (%)
              </label>
              <input
                type="number"
                min="50"
                max="100"
                value={settings.fuzzyThreshold}
                onChange={(e) => updateSetting('fuzzyThreshold', parseInt(e.target.value) || 90)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">Режим сопоставления</label>
              <select
                value={settings.matchMode}
                onChange={(e) => updateSetting('matchMode', e.target.value as 'exact' | 'exact_and_fuzzy')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="exact_and_fuzzy">Точное + нечёткое (рекомендуется)</option>
                <option value="exact">Только точное</option>
              </select>
            </div>
          </fieldset>

          {/* Склад */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Склад</legend>
            
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.autoWarehouseSelect}
                onChange={(e) => updateSetting('autoWarehouseSelect', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-600">Автовыбор склада из заказа</span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.considerVat}
                onChange={(e) => updateSetting('considerVat', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-600">Учитывать НДС при сравнении</span>
            </label>
          </fieldset>

          {/* Файлы */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Файлы</legend>
            
            <div>
              <label className="block text-sm text-gray-600 mb-1">Максимальный размер файла (МБ)</label>
              <input
                type="number"
                min="1"
                max="100"
                value={settings.maxFileSizeMB}
                onChange={(e) => updateSetting('maxFileSizeMB', parseInt(e.target.value) || 20)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </fieldset>

          {/* Экспорт */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">Экспорт</legend>
            
            <div>
              <label className="block text-sm text-gray-600 mb-1">Формат по умолчанию</label>
              <select
                value={settings.defaultExport}
                onChange={(e) => updateSetting('defaultExport', e.target.value as 'xlsx' | 'csv' | 'json')}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              >
                <option value="xlsx">XLSX</option>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
          </fieldset>

          {/* История */}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-gray-700 mb-2">История</legend>
            
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.historyEnabled}
                onChange={(e) => updateSetting('historyEnabled', e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-600">Сохранять историю сверок</span>
            </label>

            {settings.historyEnabled && (
              <div>
                <label className="block text-sm text-gray-600 mb-1">Хранить (дней)</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={settings.historyDays}
                  onChange={(e) => updateSetting('historyDays', parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
          </fieldset>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
          >
            Сохранить и закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
