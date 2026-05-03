"use client";

import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

type BatchResult = {
  total: number;
  newModels: number;
  jobsCreated: number;
};

export function BulkUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setResult(null);
    setProgress(10);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/bom/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      const data = await res.json();
      setProgress(100);
      setResult(data.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 bg-white rounded-2xl shadow-sm border border-neutral-200">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
          <FileSpreadsheet size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-neutral-900">Bulk Machine Import</h2>
          <p className="text-sm text-neutral-500">Upload a spreadsheet to sync 6,000+ machines with the retrieval engine.</p>
        </div>
      </div>

      <div 
        onClick={() => fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all
          ${isUploading ? 'bg-neutral-50 border-neutral-300' : 'hover:bg-blue-50/50 hover:border-blue-300 border-neutral-200'}
        `}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden" 
          accept=".csv,.xlsx,.xls"
        />

        <AnimatePresence mode="wait">
          {!isUploading && !result && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center"
            >
              <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                <Upload size={32} />
              </div>
              <p className="text-lg font-medium text-neutral-700">Drop spreadsheet or click to browse</p>
              <p className="text-sm text-neutral-500 mt-1">Supports CSV, XLSX up to 6,000 rows</p>
            </motion.div>
          )}

          {isUploading && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center w-full"
            >
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
              <p className="text-lg font-medium text-neutral-700">Processing Batch...</p>
              <div className="w-full h-2 bg-neutral-100 rounded-full mt-4 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  className="h-full bg-blue-600"
                />
              </div>
            </motion.div>
          )}

          {result && (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 size={32} />
              </div>
              <h3 className="text-xl font-bold text-neutral-900">Import Complete</h3>
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="p-3 bg-neutral-50 rounded-lg">
                  <div className="text-2xl font-bold text-neutral-900">{result.total}</div>
                  <div className="text-xs text-neutral-500 uppercase font-bold tracking-wider">Total</div>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                  <div className="text-2xl font-bold text-blue-600">{result.newModels}</div>
                  <div className="text-xs text-blue-500 uppercase font-bold tracking-wider">New Models</div>
                </div>
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                  <div className="text-2xl font-bold text-amber-600">{result.jobsCreated}</div>
                  <div className="text-xs text-amber-500 uppercase font-bold tracking-wider">Queued</div>
                </div>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setResult(null); }}
                className="mt-8 px-6 py-2 bg-neutral-900 text-white rounded-lg font-medium hover:bg-black transition-colors"
              >
                Upload Another
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-100">
            <AlertCircle size={18} />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}
      </div>

      <div className="mt-6 p-4 bg-neutral-50 rounded-xl border border-neutral-100">
        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-3">Expected Columns</h4>
        <div className="flex flex-wrap gap-2">
          {["machine_id", "model_number*", "serial_number", "brand", "product_type", "location", "condition", "notes"].map(col => (
            <span key={col} className={`px-2 py-1 rounded border text-[10px] font-mono ${col.includes('*') ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold' : 'bg-white border-neutral-200 text-neutral-500'}`}>
              {col.replace('*', '')}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
