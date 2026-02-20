import { useState, useCallback, useRef } from 'react';
import { uploadPDF } from '../utils/api';

interface Props {
  onUpload: (data: any) => void;
}

export default function UploadZone({ onUpload }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Only PDF files are accepted.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const data = await uploadPDF(file);
      onUpload(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onClick = useCallback(() => inputRef.current?.click(), []);

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={onClick}
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
          dragging
            ? 'border-brand-cyan bg-brand-cyan-light scale-[1.02]'
            : 'border-gray-300 hover:border-brand-cyan/50 hover:bg-gray-50'
        }`}
      >
        {uploading ? (
          <div className="text-gray-500">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-300 border-t-brand-cyan rounded-full mb-2" />
            <p className="text-sm font-medium">Analyzing PDF...</p>
          </div>
        ) : (
          <>
            <div className={`w-10 h-10 mx-auto mb-2 rounded-full flex items-center justify-center ${
              dragging ? 'bg-brand-cyan/20' : 'bg-gray-100'
            }`}>
              <svg className={`w-5 h-5 ${dragging ? 'text-brand-cyan' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-sm text-gray-500 font-medium">Drop PDF here or click to upload</p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        onChange={onInputChange}
        className="hidden"
      />
      {error && <p className="text-red-500 text-xs mt-1.5 font-medium">{error}</p>}
    </div>
  );
}
