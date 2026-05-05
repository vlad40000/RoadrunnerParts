'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  ShoppingCart, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  DollarSign,
  ArrowRight,
  Zap,
  Sparkles,
  ChevronLeft
} from 'lucide-react';
import Link from 'next/link';

type MarketSignal = {
  partNumber: string;
  normalizedModel: string | null;
  name: string;
  active: number;
  sold: number;
  sellThrough: number | null;
  medianPrice: number | null;
  netExpected: number | null;
  demand: 'critical' | 'high' | 'medium' | 'low';
  checkedAt: string | null;
};

type PipelineStats = {
  pendingSurvey: number;
  surveyed: number;
  marketSignals: number;
  draftListings: number;
};

export default function MarketPage() {
  const [marketSignals, setMarketSignals] = useState<MarketSignal[]>([]);
  const [stats, setStats] = useState<PipelineStats>({
    pendingSurvey: 0,
    surveyed: 0,
    marketSignals: 0,
    draftListings: 0,
  });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function loadPipelineState() {
    setError('');
    try {
      const response = await fetch('/api/ebay/pipeline?limit=50', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.detail || payload?.error || 'Failed to load eBay pipeline.');
      }
      setMarketSignals(Array.isArray(payload.signals) ? payload.signals : []);
      setStats(payload.stats || {
        pendingSurvey: 0,
        surveyed: 0,
        marketSignals: 0,
        draftListings: 0,
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load eBay pipeline.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPipelineState();
  }, []);

  async function startBulkDraft() {
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/ebay/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'prepare_drafts',
          limit: 25,
          minNetExpected: 15,
          dryRun: false,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.detail || payload?.error || 'Bulk draft creation failed.');
      }
      setMarketSignals(Array.isArray(payload.signals) ? payload.signals : []);
      setStats(payload.stats || stats);
      setMessage(`Prepared ${payload.preparedCount || 0} eBay draft listings. Nothing was published.`);
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Bulk draft creation failed.');
    } finally {
      setRunning(false);
    }
  }

  const yieldStats = {
    median:
      marketSignals.length > 0
        ? marketSignals.reduce((sum, signal) => sum + (signal.medianPrice || 0), 0) / marketSignals.length
        : 0,
    target:
      marketSignals.length > 0
        ? marketSignals.reduce((sum, signal) => sum + (signal.netExpected || 0), 0) / marketSignals.length
        : 0,
    projected:
      marketSignals.reduce((sum, signal) => sum + (signal.netExpected || 0), 0),
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans">
      <header className="mb-12 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500">
            <ChevronLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
              Market <span className="text-blue-600">Intelligence</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">System 2: eBay Resale Signals</p>
          </div>
        </div>
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          <button className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all">Real-time</button>
          <button className="px-4 py-1.5 text-slate-400 hover:text-slate-900 rounded-lg text-xs font-bold uppercase tracking-widest transition-all">Historical</button>
        </div>
      </header>

      {(message || error) && (
        <div className={`mb-6 rounded-xl border p-4 text-sm font-semibold ${
          error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          {error || message}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Pending Survey', stats.pendingSurvey],
          ['Market Signals', stats.marketSignals],
          ['Draft Listings', stats.draftListings],
          ['Surveyed', stats.surveyed],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</div>
            <div className="mt-2 text-2xl font-black text-slate-900">{Number(value).toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <TrendingUp className="text-blue-600" size={16} />
              Market Velocity Rankings
            </h2>
            <button className="text-blue-600 text-[10px] font-black uppercase tracking-widest hover:underline flex items-center gap-1">
              View Analytics <ArrowRight size={12} />
            </button>
          </div>
          
          <div className="space-y-4">
            {loading && (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                Loading market signals
              </div>
            )}
            {!loading && marketSignals.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                No eBay market signals yet. Run the market survey batch first.
              </div>
            )}
            {marketSignals.map((signal, i) => (
              <motion.div
                key={signal.partNumber}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-white border border-slate-200 p-6 rounded-2xl flex items-center justify-between hover:border-blue-600 transition-all cursor-pointer group shadow-sm"
              >
                <div className="flex items-center gap-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                    signal.demand === 'critical' ? 'bg-red-50 text-red-600 border border-red-100' :
                    signal.demand === 'high' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                    'bg-blue-50 text-blue-600 border border-blue-100'
                  }`}>
                    <ShoppingCart size={24} />
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-0.5">{signal.partNumber}</div>
                    <div className="font-bold text-lg text-slate-900">{signal.name}</div>
                  </div>
                </div>

                <div className="flex items-center gap-12">
                  <div className="text-right hidden sm:block">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Sell-Through</div>
                    <div className="font-black text-xl text-slate-900">{signal.sellThrough === null ? '-' : `${signal.sellThrough.toFixed(2)}x`}</div>
                  </div>
                  <div className="text-right min-w-[120px]">
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-right">Net Expected</div>
                    <div className="font-black text-xl text-blue-600">{signal.netExpected === null ? '-' : `$${signal.netExpected.toFixed(2)}`}</div>
                  </div>
                  <ChevronRight className="text-slate-200 group-hover:text-blue-600 transition-colors" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-slate-900 p-8 rounded-[2rem] relative overflow-hidden group shadow-xl">
            <div className="relative z-10">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center mb-6 shadow-lg shadow-blue-600/30">
                <Zap size={20} className="text-white" />
              </div>
              <h3 className="text-2xl font-black text-white mb-3 uppercase tracking-tight">Listing<br/>Assistant</h3>
              <p className="text-slate-400 mb-8 text-[11px] font-medium leading-relaxed uppercase tracking-wider">
                Generate AI-optimized marketplace assets for high-margin components.
              </p>
              <button
                type="button"
                onClick={startBulkDraft}
                disabled={running}
                className="w-full bg-blue-600 text-white py-3.5 rounded-xl font-black text-xs uppercase tracking-[0.2em] hover:bg-blue-500 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {running ? 'Preparing Drafts' : 'Start Bulk Draft'}
                <ExternalLink size={16} />
              </button>
            </div>
            <Sparkles className="absolute -bottom-4 -right-4 text-white/5 group-hover:scale-110 transition-transform" size={160} />
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6 flex items-center gap-2">
              <DollarSign className="text-blue-600" size={14} />
              Yield Optimization
            </h3>
            <div className="space-y-5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Market Median</span>
                <span className="font-black text-slate-900">${yieldStats.median.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Target Pricing</span>
                <span className="font-black text-slate-900">${yieldStats.target.toFixed(2)}</span>
              </div>
              <div className="h-px bg-slate-100 my-2" />
              <div className="flex justify-between items-center pt-2">
                <span className="text-xs font-black uppercase text-slate-900 tracking-tight">Projected Yield</span>
                <div className="text-right">
                  <div className="text-emerald-600 font-black text-lg">${yieldStats.projected.toFixed(2)}</div>
                  <div className="text-[8px] font-bold text-emerald-600/60 uppercase tracking-widest">Current Signals</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
