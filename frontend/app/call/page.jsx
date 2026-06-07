'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, PhoneCall, Copy, Check, RefreshCw, History, Clock, Zap } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

const CHAIN_META = {
  amoy:           { color: '#8247e5', short: 'AMOY', chainId: 80002,    displayName: 'Polygon Amoy',  hasContract: true  },
  fuji:           { color: '#e84142', short: 'AVAX', chainId: 43113,    displayName: 'Fuji AVAX',     hasContract: false },
  'eth-sepolia':  { color: '#627eea', short: 'ETH',  chainId: 11155111, displayName: 'ETH Sepolia',   hasContract: false },
  bnb:            { color: '#f3ba2f', short: 'BNB',  chainId: 97,       displayName: 'BNB Testnet',   hasContract: false },
  'op-sepolia':   { color: '#ff0420', short: 'OP',   chainId: 11155420, displayName: 'OP Sepolia',    hasContract: false },
  'celo-sepolia': { color: '#35d07f', short: 'CELO', chainId: 44787,    displayName: 'Celo Sepolia',  hasContract: false },
  'base-sepolia': { color: '#0052ff', short: 'BASE', chainId: 84532,    displayName: 'Base Sepolia',  hasContract: false },
};

const POLL_INTERVAL = 3_000;
const CALL_TIMEOUT  = 120_000;

function now() { return new Date().toLocaleTimeString(); }

function ChainCallCard({ chainKey, onDone }) {
  const meta = CHAIN_META[chainKey];

  const [phase,  setPhase]  = useState('idle');
  const [logs,   setLogs]   = useState([]);
  const [result, setResult] = useState(null);

  const pollRef      = useRef(null);
  const deadlineRef  = useRef(0);
  const step4Logged  = useRef(false);

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  function addLog(msg, type = 'info') {
    setLogs(prev => [...prev, { time: now(), msg, type }]);
  }

  function reset() {
    if (pollRef.current) clearTimeout(pollRef.current);
    step4Logged.current = false;
    setPhase('idle');
    setLogs([]);
    setResult(null);
  }

  const poll = useCallback(async (chainKey, ts) => {
    if (Date.now() > deadlineRef.current) {
      setPhase('timeout');
      addLog('Timed out — no webhook received within 2 minutes.', 'error');
      return;
    }
    try {
      const res  = await fetch(`/api/call/status/${chainKey}?timestamp=${ts}`);
      const data = await res.json();

      if (!data.found) {
        pollRef.current = setTimeout(() => poll(chainKey, ts), POLL_INTERVAL);
        return;
      }

      if (data.status === 'EVENT_RECEIVED') {
        if (!step4Logged.current) {
          step4Logged.current = true;
          addLog('Step 4 → Webhook received! Kwala WF2 triggered on-chain call.', 'success');
        }
        if (data.tx_hash) {
          addLog(`Tx Hash: ${data.tx_hash}`, 'success');
          setResult({ txHash: data.tx_hash, latencyMs: data.latency_ms ?? null });
          setPhase('done');
          onDone?.();
        } else {
          addLog('Still waiting for unique tx hash (retrying actionLog…)', 'warn');
          pollRef.current = setTimeout(() => poll(chainKey, ts), POLL_INTERVAL);
        }
        return;
      }

      if (data.status === 'FAILED') {
        setPhase('failed');
        addLog('Transaction failed on-chain.', 'error');
        return;
      }
    } catch { /* transient — keep polling */ }
    pollRef.current = setTimeout(() => poll(chainKey, ts), POLL_INTERVAL);
  }, [onDone]);

  async function handleCall() {
    if (phase === 'sending' || phase === 'waiting') return;
    reset();
    setPhase('sending');
    addLog('Step 1 → Sending Set1() transaction to Kwala…', 'info');

    try {
      const res  = await fetch(`/api/call/trigger/${chainKey}`, { method: 'POST' });
      const data = await res.json();

      if (!data.success) {
        setPhase('failed');
        addLog(`Failed: ${data.error ?? 'Unknown error'}`, 'error');
        return;
      }

      const ts = data.timestamp;
      addLog(`Step 1 → Set1(${ts}) queued. Queue ID: ${data.queue_id ?? '—'}`, 'success');
      addLog('Step 2 → Kwala WF1 will detect the Set1 event and call Set2…', 'info');
      addLog('Step 3 → Kwala WF2 monitors Set2 event, then POSTs webhook here…', 'info');

      setPhase('waiting');
      deadlineRef.current = Date.now() + CALL_TIMEOUT;
      pollRef.current = setTimeout(() => poll(chainKey, ts), POLL_INTERVAL);
    } catch (err) {
      setPhase('failed');
      addLog(`Network error: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  }

  const isActive = phase === 'sending' || phase === 'waiting';

  const cardBorder = {
    idle:    '#2D1F4E',
    sending: '#3B82F6aa',
    waiting: meta.color + 'aa',
    done:    '#10B98188',
    failed:  '#EF444488',
    timeout: '#EF444488',
  }[phase];

  const logColor = {
    info:    '#94A3B8',
    success: '#34D399',
    error:   '#F87171',
    warn:    '#FBBF24',
  };

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-5 transition-all"
      style={{ background: '#1A1035', border: `1px solid ${cardBorder}` }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-xl text-xs font-bold shrink-0"
          style={{ width: 44, height: 44, background: meta.color + '22', border: `1px solid ${meta.color}55`, color: meta.color }}
        >
          {meta.short}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#6B5A8E' }}>
            Call Contract
          </p>
          <h3 className="font-semibold text-white truncate">{meta.displayName}</h3>
          <p className="text-xs mt-0.5" style={{ color: '#4B3A6A' }}>Chain ID: {meta.chainId}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(phase === 'done' || phase === 'failed' || phase === 'timeout') && (
            <button
              onClick={reset}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#6B5A8E' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#8B5CF6')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6B5A8E')}
              title="Reset"
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button
            onClick={handleCall}
            disabled={isActive || !meta.hasContract}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              background: (isActive || !meta.hasContract) ? '#2D1F4E' : 'linear-gradient(135deg, #6B3FA0, #8B5CF6)',
              color: (isActive || !meta.hasContract) ? '#6B5A8E' : '#fff',
            }}
            title={!meta.hasContract ? 'Contract not configured' : undefined}
          >
            {phase === 'sending' ? (
              <><Loader2 size={13} className="animate-spin" /> Sending…</>
            ) : phase === 'waiting' ? (
              <><Loader2 size={13} className="animate-spin" /> Waiting…</>
            ) : (
              <><PhoneCall size={13} /> Call</>
            )}
          </button>
        </div>
      </div>

      {!meta.hasContract && (
        <div
          className="text-xs px-3 py-2 rounded-lg"
          style={{ background: 'rgba(107,90,142,0.1)', border: '1px solid #2D1F4E', color: '#6B5A8E' }}
        >
          Contract address not configured for this chain.
        </div>
      )}

      {logs.length > 0 && (
        <div
          className="rounded-xl p-3 flex flex-col gap-1 font-mono text-xs"
          style={{ background: '#0A061A', border: '1px solid #2D1F4E', maxHeight: 120, overflowY: 'auto' }}
        >
          {logs.map((l, i) => (
            <div key={i} className="flex gap-2 leading-5">
              <span style={{ color: '#4B3A6A', flexShrink: 0 }}>{l.time}</span>
              <span style={{ color: logColor[l.type] }}>{l.msg}</span>
            </div>
          ))}
        </div>
      )}

      {phase === 'done' && result && (
        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: '#0F0A1A', border: '1px solid #10B98133' }}
        >
          <ResultRow label="Tx Hash" value={result.txHash} mono copyable />
          {result.latencyMs !== null && (
            <div className="flex items-center gap-1.5 text-xs" style={{ color: '#6B5A8E' }}>
              <Clock size={11} />
              <span>End-to-end latency: </span>
              <span style={{ color: '#34D399', fontWeight: 600 }}>{(result.latencyMs / 1000).toFixed(1)}s</span>
            </div>
          )}
        </div>
      )}

      {phase !== 'idle' && phase !== 'done' && (
        <div className="flex items-center gap-2 text-xs" style={{ color: '#6B5A8E' }}>
          <span
            className="rounded-full shrink-0"
            style={{
              width: 6, height: 6,
              background: phase === 'failed' || phase === 'timeout' ? '#EF4444' : phase === 'waiting' ? meta.color : '#3B82F6',
              animation: isActive ? 'pulse 1.2s infinite' : 'none',
            }}
          />
          {phase === 'sending' && 'Broadcasting transaction…'}
          {phase === 'waiting' && 'Monitoring for webhook event…'}
          {phase === 'failed'  && <span style={{ color: '#F87171' }}>Call failed</span>}
          {phase === 'timeout' && <span style={{ color: '#F87171' }}>Timed out</span>}
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, mono, copyable }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B5A8E' }}>{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs break-all flex-1" style={{ color: '#34D399', fontFamily: mono ? 'monospace' : undefined, fontWeight: 600 }}>
          {value}
        </span>
        {copyable && (
          <button onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="shrink-0" title="Copy" style={{ color: copied ? '#34D399' : '#6B5A8E' }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

function CallHistoryTable({ refreshTick }) {
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res  = await fetch('/api/call/history?limit=30');
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch { /* non-fatal */ }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory, refreshTick]);

  const statusBadge = (s) => {
    const cfg = {
      EVENT_RECEIVED: { bg: '#10B98122', color: '#34D399' },
      SENT:           { bg: '#3B82F622', color: '#60A5FA' },
      FAILED:         { bg: '#EF444422', color: '#F87171' },
    };
    return cfg[s] ?? { bg: '#2D1F4E', color: '#9B89C4' };
  };

  if (loading) return (
    <div className="flex items-center gap-2 py-4" style={{ color: '#6B5A8E' }}>
      <Loader2 size={14} className="animate-spin" /> Loading history…
    </div>
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2D1F4E' }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: '#1A1035', borderBottom: '1px solid #2D1F4E' }}>
            {['Chain', 'Status', 'Tx Hash', 'Latency', 'Time'].map(h => (
              <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider" style={{ color: '#9B89C4' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: '#6B5A8E' }}>No call events yet.</td></tr>
          ) : rows.map((r, i) => {
            const meta = CHAIN_META[r.chain_key] ?? { color: '#8B5CF6', short: r.chain_key.slice(0, 4).toUpperCase() };
            const badge = statusBadge(r.status);
            return (
              <tr key={r.id}
                style={{ borderBottom: '1px solid #2D1F4E', background: i % 2 === 0 ? '#120C2A' : '#0F0A1A' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1A1035')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#120C2A' : '#0F0A1A')}
              >
                <td className="px-4 py-2.5">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}
                  >
                    {meta.short}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className="px-2 py-0.5 rounded-full" style={{ background: badge.bg, color: badge.color }}>
                    {r.status === 'EVENT_RECEIVED' ? 'Received' : r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono" style={{ color: '#8B5CF6' }}>
                  {r.tx_hash
                    ? <>{r.tx_hash.slice(0, 8)}…{r.tx_hash.slice(-6)}<CopyInline value={r.tx_hash} /></>
                    : '—'}
                </td>
                <td className="px-4 py-2.5" style={{ color: r.latency_ms ? '#34D399' : '#6B5A8E' }}>
                  {r.latency_ms != null
                    ? <><Zap size={10} className="inline mr-1" />{(r.latency_ms / 1000).toFixed(1)}s</>
                    : '—'}
                </td>
                <td className="px-4 py-2.5" style={{ color: '#6B5A8E' }}>
                  {new Date(r.transaction_sent_time).toLocaleTimeString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CopyInline({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="ml-1.5 align-middle"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ color: copied ? '#34D399' : '#4B3A6A' }}
    >
      {copied ? <Check size={11} className="inline" /> : <Copy size={11} className="inline" />}
    </button>
  );
}

export default function CallPage() {
  const [refreshTick, setRefreshTick] = useState(0);
  const chainKeys = Object.keys(CHAIN_META);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: '#0F0A1A' }}>
        <header
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ background: '#120C2A', borderBottom: '1px solid #2D1F4E' }}
        >
          <div>
            <h1 className="text-base font-semibold text-white">Call Contract</h1>
            <p className="text-xs" style={{ color: '#6B5A8E' }}>
              Trigger Set1 → Kwala WF1 → Set2 → Kwala WF2 → Webhook — end-to-end flow
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          <div>
            <p className="text-sm mb-4" style={{ color: '#6B5A8E' }}>
              Click <strong style={{ color: '#9B89C4' }}>Call</strong> to trigger the two-workflow Kwala flow.
              The card will show each step in real-time and display the final tx hash once the webhook is received.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {chainKeys.map(key => (
                <ChainCallCard key={key} chainKey={key} onDone={() => setRefreshTick(t => t + 1)} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <History size={15} style={{ color: '#8B5CF6' }} />
                <h2 className="font-semibold text-white text-sm">Call History</h2>
              </div>
              <button
                onClick={() => setRefreshTick(t => t + 1)}
                className="p-1.5 rounded-lg transition-colors"
                style={{ color: '#6B5A8E' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#8B5CF6')}
                onMouseLeave={e => (e.currentTarget.style.color = '#6B5A8E')}
                title="Refresh history"
              >
                <RefreshCw size={13} />
              </button>
            </div>
            <CallHistoryTable refreshTick={refreshTick} />
          </div>
        </div>
      </div>
    </div>
  );
}
