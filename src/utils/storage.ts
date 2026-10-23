/**
 * Хранилище настроек и истории сверок в localStorage
 */

import { AppSettings, DEFAULT_SETTINGS, HistoryEntry } from '../types';

const SETTINGS_KEY = 'price_reconciliation_settings';
const HISTORY_KEY = 'price_reconciliation_history';

/**
 * Загрузка настроек
 */
export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Ошибка загрузки настроек:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Сохранение настроек
 */
export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Ошибка сохранения настроек:', e);
  }
}

/**
 * Загрузка истории сверок
 */
export function loadHistory(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (stored) {
      const entries: HistoryEntry[] = JSON.parse(stored);
      // Фильтруем по сроку хранения
      const settings = loadSettings();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - settings.historyDays);
      return entries.filter(e => new Date(e.timestamp) > cutoff);
    }
  } catch (e) {
    console.error('Ошибка загрузки истории:', e);
  }
  return [];
}

/**
 * Сохранение записи в историю
 */
export function saveToHistory(entry: HistoryEntry): void {
  try {
    const settings = loadSettings();
    if (!settings.historyEnabled) return;
    
    let history = loadHistory();
    history.unshift(entry);
    
    // Ограничиваем размер истории
    if (history.length > 50) {
      history = history.slice(0, 50);
    }
    
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Ошибка сохранения истории:', e);
  }
}

/**
 * Удаление записи из истории
 */
export function deleteFromHistory(id: string): void {
  try {
    const history = loadHistory();
    const filtered = history.filter(e => e.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Ошибка удаления из истории:', e);
  }
}

/**
 * Очистка всей истории
 */
export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (e) {
    console.error('Ошибка очистки истории:', e);
  }
}
