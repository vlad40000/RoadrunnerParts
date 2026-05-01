'use client';

import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowUpDown,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Filter,
  Package,
  Search,
  TrendingUp,
  Upload,
} from 'lucide-react';
import Link from 'next/link';

type InventoryMachine = {
  id: string;
  brand: string;
  model: string;
  type: string;
  score: number;
  action: string;
  value: number;
  status: string;
  serial?: string;
  location?: string;
  condition?: string;
};

type ImportResponse = {
  ok?: boolean;
  fileName?: string;
  rowCount?: number;
  importedCount?: number;
  machines?: Array<InventoryMachine>;
  warnings?: Array<string>;
  error?: string;
};

const DEMO_MACHINES: Array<InventoryMachine> = [
  {
    id: '1',
    brand: 'Whirlpool',
    model: 'WTW7500GC2',
    type: 'Washer',
    score: 845,
    action: 'repair_and_sell_whole',
    value: 450,
    status: 'ready',
  },
  {
    id: '2',
    brand: 'Samsung',
    model: 'RF263TEAESG',
    type: 'Refrigerator',
    score: 720,
    action: 'part_out',
    value: 1200,
    status: 'bom_complete',
  },
  {
    id: '3',
    brand: 'GE',
    model: 'GTW725BSN0WS',
    type: 'Washer',
    score: 410,
    action: 'wholesale',
    value: 150,
    status: 'identity_only',
  },
];

function formatLabel(value: string): string {
  return value.replace(/_/g, ' ');
}

function csvEscape(value: string | number | undefined): string {
  const raw = value === undefined ? '' : String(value);
  return /[",\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export default function InventoryPage() {
  const [machines, setMachines] = useState<Array<InventoryMachine>>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importError, setImportError] = useState('');
  const [importWarnings, setImportWarnings] = useState<Array<string>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setMachines(DEMO_MACHINES);
      setLoading(false);
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, []);

  const filteredMachines = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return machines;
    }

    return machines.filter((machine) =>
      [
        machine.brand,
        machine.model,
        machine.type,
        machine.status,
        machine.action,
        machine.serial,
        machine.location,
        machine.condition,
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery)),
    );
  }, [machines, query]);

  const stats = useMemo(() => {
    const highPriority = machines.filter((machine) => machine.score >= 800).length;
    const requiresReview = machines.filter((machine) =>
      ['identity_only', 'imported', 'review', 'failed'].includes(machine.status),
    ).length;
    const bomComplete = machines.filter((machine) =>
      ['bom_complete', 'db_complete'].includes(machine.status),
    ).length;

    return [
      { label: 'High Priority', value: highPriority.toLocaleString(), icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
      { label: 'Total Machines', value: machines.length.toLocaleString(), icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'Requires Review', value: requiresReview.toLocaleString(), icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
      { label: 'BOM Complete', value: bomComplete.toLocaleString(), icon: CheckCircle, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    ];
  }, [machines]);

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setImporting(true);
    setImportMessage('');
    setImportError('');
    setImportWarnings([]);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/inventory/import', {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json()) as ImportResponse;

      if (!response.ok || !payload.ok || !payload.machines) {
        throw new Error(payload.error || 'Inventory import failed.');
      }

      setMachines(payload.machines);
      setImportWarnings(payload.warnings ?? []);
      setImportMessage(
        `Imported ${payload.importedCount?.toLocaleString() ?? payload.machines.length.toLocaleString()} of ${payload.rowCount?.toLocaleString() ?? payload.machines.length.toLocaleString()} rows from ${payload.fileName ?? file.name}.`,
      );
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Inventory import failed.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  function handleExport() {
    const headers = ['model', 'brand', 'type', 'priority_score', 'recommended_action', 'bom_status', 'market_value', 'serial', 'location', 'condition'];
    const rows = filteredMachines.map((machine) => [
      machine.model,
      machine.brand,
      machine.type,
      machine.score,
      machine.action,
      machine.status,
      machine.value,
      machine.serial,
      machine.location,
      machine.condition,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => csvEscape(value)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'inventory-prioritization.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <header className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500" aria-label="Back to home">
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2 uppercase">
              Inventory <span className="text-blue-600">Prioritization</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Master Ranking & ROI Analysis</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={handleImport}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 bg-blue-600 border border-blue-600 text-white rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-wider hover:bg-blue-700 transition-colors shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload size={16} />
            {importing ? 'Importing' : 'Upload CSV/XLSX'}
          </button>
          <button
            type="button"
            onClick={handleExport}
            className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </header>

      {(importMessage || importError || importWarnings.length > 0) && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FileSpreadsheet size={18} />
            </div>
            <div>
              {importMessage && (
                <p className="text-sm font-bold text-slate-800">{importMessage}</p>
              )}
              {importError && (
                <p className="text-sm font-bold text-red-600">{importError}</p>
              )}
              {importWarnings.length > 0 && (
                <p className="mt-1 text-xs font-semibold text-amber-700">
                  {importWarnings.slice(0, 3).join(' ')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm"
          >
            <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center mb-4`}>
              <stat.icon size={20} />
            </div>
            <div className="text-3xl font-black text-slate-900 mb-1">{stat.value}</div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col gap-3 bg-slate-50/50 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="FILTER BY MODEL, BRAND, OR STATUS..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-bold focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors" aria-label="Filter inventory">
              <Filter size={18} />
            </button>
            <button type="button" className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors" aria-label="Sort inventory">
              <ArrowUpDown size={18} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-6 py-4">Machine Details</th>
                <th className="px-6 py-4">Priority Score</th>
                <th className="px-6 py-4">Recommended Action</th>
                <th className="px-6 py-4">BOM Progress</th>
                <th className="px-6 py-4 text-right">Market Valuation</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && (
                <tr>
                  <td className="px-6 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400" colSpan={6}>
                    Loading inventory
                  </td>
                </tr>
              )}
              {!loading && filteredMachines.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-center text-xs font-bold uppercase tracking-widest text-slate-400" colSpan={6}>
                    No machines match the current filter
                  </td>
                </tr>
              )}
              {!loading && filteredMachines.map((m, i) => (
                <motion.tr
                  key={m.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="px-6 py-5">
                    <div className="font-bold text-slate-900 text-sm">{m.model}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{m.brand} - {m.type}</div>
                  </td>
                  <td className="px-6 py-5">
                    <div className={`text-xl font-black ${m.score > 800 ? 'text-green-600' : m.score > 600 ? 'text-blue-600' : 'text-slate-400'}`}>
                      {m.score}
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${
                      m.action === 'part_out' ? 'bg-purple-50 text-purple-600 border border-purple-100' :
                      m.action === 'repair_and_sell_whole' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                      'bg-slate-50 text-slate-500 border border-slate-100'
                    }`}>
                      {formatLabel(m.action)}
                    </span>
                  </td>
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${m.status === 'bom_complete' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                          style={{ width: m.status === 'bom_complete' ? '100%' : '45%' }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">
                        {formatLabel(m.status)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right font-black text-slate-900 text-sm">
                    ${m.value.toLocaleString()}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button type="button" className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-all opacity-0 group-hover:opacity-100" aria-label={`Open ${m.model}`}>
                      <ChevronRight size={18} />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
