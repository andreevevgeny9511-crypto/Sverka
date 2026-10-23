/**
 * Утилиты нормализации текста для сопоставления
 * Реализует: trim, collapse spaces, case-insensitive, ё→е, 
 * удаление кавычек, нормализацию запятых/точек
 */

/**
 * Полная нормализация строки для сравнения
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')          // ё → е
    .replace(/Ё/g, 'Е')
    .replace(/[""«»„"‟]/g, '')    // убрать все виды кавычек
    .replace(/\s+/g, ' ')        // схлопнуть пробелы
    .replace(/[.,]/g, ' ')       // нормализовать точки/запятые в пробелы (для сравнения)
    .trim();
}

/**
 * Нормализация для сравнения названий складов
 * (без замены точек/запятых на пробелы)
 */
export function normalizeWarehouse(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/Ё/g, 'Е')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Извлечение названия склада из заголовка колонки матрицы
 * Отбрасывает класс (A/B/C) в конце
 * Пример: "Красноярск Мужества 10, C - класс" → "Красноярск Мужества 10"
 */
export function extractWarehouseName(header: string): { name: string; className: string } {
  if (!header) return { name: '', className: '' };
  
  // Паттерн: название склада, затем класс (A/B/C) - класс
  const classPattern = /[,;\s]+[ABC]\s*[-–]?\s*класс/i;
  const match = header.match(classPattern);
  
  if (match) {
    const name = header.substring(0, match.index).trim();
    const className = match[0].trim();
    return { name, className };
  }
  
  // Альтернативный паттерн: просто буква класса в конце
  const simplePattern = /[,;\s]+([ABC])\s*$/i;
  const simpleMatch = header.match(simplePattern);
  if (simpleMatch) {
    const name = header.substring(0, simpleMatch.index).trim();
    return { name, className: simpleMatch[1].toUpperCase() };
  }
  
  return { name: header.trim(), className: '' };
}

/**
 * Сравнение двух названий складов (нормализованное)
 */
export function warehouseMatches(orderWarehouse: string, columnWarehouse: string): boolean {
  const normOrder = normalizeWarehouse(orderWarehouse);
  const normColumn = normalizeWarehouse(columnWarehouse);
  
  // Точное совпадение после нормализации
  if (normOrder === normColumn) return true;
  
  // Колонка начинается с названия склада из заказа
  if (normColumn.startsWith(normOrder)) return true;
  
  // Название склада из заказа начинается с названия колонки
  if (normOrder.startsWith(normColumn)) return true;
  
  return false;
}

/**
 * Точное сравнение наименований (после полной нормализации)
 */
export function namesMatchExact(orderName: string, matrixName: string): boolean {
  return normalizeText(orderName) === normalizeText(matrixName);
}

/**
 * Fuzzy-сопоставление двух строк (token set ratio)
 * Возвращает score от 0 до 100
 */
export function fuzzyMatch(str1: string, str2: string): number {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);
  
  if (s1 === s2) return 100;
  if (!s1 || !s2) return 0;
  
  // Реализация token set ratio
  const tokens1 = new Set(s1.split(/\s+/).filter(t => t.length > 0));
  const tokens2 = new Set(s2.split(/\s+/).filter(t => t.length > 0));
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  // Intersection
  const intersection = new Set<string>();
  for (const t of tokens1) {
    if (tokens2.has(t)) intersection.add(t);
  }
  
  // Differences
  const diff1 = new Set<string>();
  for (const t of tokens1) {
    if (!intersection.has(t)) diff1.add(t);
  }
  const diff2 = new Set<string>();
  for (const t of tokens2) {
    if (!intersection.has(t)) diff2.add(t);
  }
  
  const intersectionStr = Array.from(intersection).sort().join(' ');
  const diff1Str = Array.from(diff1).sort().join(' ');
  const diff2Str = Array.from(diff2).sort().join(' ');
  
  const s1Combined = (intersectionStr + ' ' + diff1Str).trim();
  const s2Combined = (intersectionStr + ' ' + diff2Str).trim();
  const s3Combined = (diff1Str + ' ' + diff2Str).trim();
  
  const ratio12 = levenshteinRatio(s1Combined, s2Combined);
  const ratio13 = levenshteinRatio(s1Combined, s3Combined);
  const ratio23 = levenshteinRatio(s2Combined, s3Combined);
  
  return Math.max(ratio12, ratio13, ratio23);
}

/**
 * Вычисление ratio на основе расстояния Левенштейна (0-100)
 */
function levenshteinRatio(s1: string, s2: string): number {
  if (s1 === s2) return 100;
  if (s1.length === 0) return 0;
  if (s2.length === 0) return 0;
  
  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

/**
 * Расстояние Левенштейна (динамическое программирование)
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  
  return dp[m][n];
}

/**
 * Парсинг числа из строки (устойчивый к форматам)
 * Поддерживает: "499", "499,00", "1 020", "195.5", "174 282,40"
 */
export function parsePrice(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  
  // Если уже число
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }
  
  const str = String(value).trim();
  if (!str) return null;
  
  // Убираем пробелы-разделители тысяч
  let cleaned = str.replace(/\s+/g, '');
  
  // Определяем десятичный разделитель
  // Если есть и запятая и точка — последний символ является десятичным
  if (cleaned.includes(',') && cleaned.includes('.')) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Запятая — десятичный разделитель
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // Точка — десятичный разделитель
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Только запятая — десятичный разделитель (русский формат)
    cleaned = cleaned.replace(',', '.');
  }
  // Если только точка — оставляем как есть (может быть десятичным)
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Форматирование числа для отображения (русский формат)
 */
export function formatPrice(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('ru-RU', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
}

/**
 * Форматирование процента
 */
export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('ru-RU', { 
    minimumFractionDigits: 1, 
    maximumFractionDigits: 1 
  }) + '%';
}
