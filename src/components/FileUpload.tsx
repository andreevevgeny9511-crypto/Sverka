/**
 * Компонент загрузки файлов (drag & drop + выбор)
 */

import React, { useCallback, useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, Link2 } from 'lucide-react';

interface FileUploadProps {
  label: string;
  description: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  accept?: string;
  maxSizeMB?: number;
  googleDriveLink?: string;
  onGoogleDriveLinkChange?: (link: string) => void;
  showGoogleDrive?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  label,
  description,
  file,
  onFileSelect,
  onClear,
  accept = '.xlsx,.xls',
  maxSizeMB = 20,
  googleDriveLink = '',
  onGoogleDriveLinkChange,
  showGoogleDrive = false,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateFile = useCallback((f: File): boolean => {
    setError(null);
    
    const ext = f.name.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls'].includes(ext || '')) {
      setError('Поддерживаются только файлы .xlsx и .xls');
      return false;
    }
    
    if (f.size > maxSizeMB * 1024 * 1024) {
      setError(`Файл слишком большой (макс. ${maxSizeMB} МБ)`);
      return false;
    }
    
    return true;
  }, [maxSizeMB]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0 && validateFile(files[0])) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect, validateFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && validateFile(files[0])) {
      onFileSelect(files[0]);
    }
    if (inputRef.current) inputRef.current.value = '';
  }, [onFileSelect, validateFile]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / (1024 * 1024)).toFixed(1) + ' МБ';
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-700">
        {label}
      </label>
      <p className="text-xs text-gray-500">{description}</p>
      
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !file && inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
          ${file ? 'border-green-400 bg-green-50' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />
        
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="w-8 h-8 text-green-600" />
            <div className="text-left">
              <p className="font-medium text-green-800">{file.name}</p>
              <p className="text-sm text-green-600">{formatSize(file.size)}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="ml-4 p-1 rounded-full hover:bg-red-100 text-red-500"
            >
              ✕
            </button>
          </div>
        ) : (
          <div>
            <Upload className="w-10 h-10 mx-auto text-gray-400 mb-2" />
            <p className="text-sm text-gray-600">
              Перетащите файл сюда или <span className="text-blue-600 font-medium">выберите</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">.xlsx, .xls (до {maxSizeMB} МБ)</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Google Drive link */}
      {showGoogleDrive && onGoogleDriveLinkChange && (
        <div className="flex items-center gap-2">
          <Link2 className="w-4 h-4 text-gray-400" />
          <input
            type="url"
            placeholder="Ссылка на Google Drive (публичная)..."
            value={googleDriveLink}
            onChange={(e) => onGoogleDriveLinkChange(e.target.value)}
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}
    </div>
  );
};
