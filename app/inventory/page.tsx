'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  TrendingUp, 
  Package, 
  AlertTriangle, 
  CheckCircle, 
  ChevronRight,
  Filter,
  Download,
  Search,
  ArrowUpDown,
  ClipboardList,
  ChevronLeft
} from 'lucide-react';
import Link from 'next/link';

export default function InventoryPage() {
  const [machines, setMachines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Mock data for now
    setTimeout(() => {
      setMachines([
        { 
          id: '1', 
          brand: 'Whirlpool', 
          model: 'WTW7500GC2', 
          type: 'Washer', 
          score: 845, 
          action: 'repair_and_sell_whole', 
          value: 450,
          status: 'ready'
        },
        { 
          id: '2', 
          brand: 'Samsung', 
          model: 'RF263TEAESG', 
          type: 'Refrigerator', 
          score: 720, 
          action: 'part_out', 
          value: 1200,
          status: 'bom_complete'
        },
        { 
          id: '3', 
          brand: 'GE', 
          model: 'GTW725BSN0WS', 
          type: 'Washer', 
          score: 410, 
          action: 'wholesale', 
          value: 150,
          status: 'identity_only'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <header className="mb-10 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2 uppercase">
              Inventory <span className="text-blue-600">Prioritization</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Master Ranking & ROI Analysis</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl flex items-center gap-2 text-xs font-bold uppercase tracking-wider hover:bg-slate-50 transition-colors shadow-sm">
            <Download size={16} />
            Export CSV
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
        {[
          { label: 'High Priority', value: '124', icon: TrendingUp, color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Total Machines', value: '6,240', icon: Package, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Requires Review', value: '42', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'BOM Complete', value: '1,840', icon: CheckCircle, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ].map((stat, i) => (
          <motion.div 
            key={i}
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
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="FILTER BY MODEL, BRAND, OR STATUS..." 
              className="w-full bg-white border border-slate-200 rounded-xl py-2 pl-10 pr-4 text-xs font-bold focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
              <Filter size={18} />
            </button>
            <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors">
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
              {machines.map((m, i) => (
                <motion.tr 
                  key={m.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.05 }}
                  className="hover:bg-slate-50 transition-colors group"
                >
                  <td className="px-6 py-5">
                    <div className="font-bold text-slate-900 text-sm">{m.model}</div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{m.brand} • {m.type}</div>
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
                      {m.action.replace(/_/g, ' ')}
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
                        {m.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right font-black text-slate-900 text-sm">
                    ${m.value.toLocaleString()}
                  </td>
                  <td className="px-6 py-5 text-right">
                    <button className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-all opacity-0 group-hover:opacity-100">
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
