'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, CheckCircle, XCircle, Rocket, Copy, Check, RefreshCw, History } from 'lucide-react';
import Sidebar from '@/components/Sidebar';

const CHAIN_META = {
  'base-sepolia': { color: '#0052ff', short: 'BASE' },
  amoy:           { color: '#8247e5', short: 'AMOY' },
  fuji:           { color: '#e84142', short: 'AVAX' },
  'op-sepolia':   { color: '#ff0420', short: 'OP'   },
  'eth-sepolia':  { color: '#627eea', short: 'ETH'  },
  bnb:            { color: '#f3ba2f', short: 'BNB'  },
  'celo-sepolia': { color: '#35d07f', short: 'CELO' },
};

const POLL_START_DELAY = 20_000;
const POLL_INTERVAL    = 10_000;
const POLL_TIMEOUT     = 180_000;

function ChainCard({ chain, onSuccess }) {
  const [status,    setStatus]    = useState('idle');
  const [message,   setMessage]   = useState('');
  const [result,    setResult]    = useState(null);
  const [countdown, setCountdown] = useState(0);

  const pollTimerRef      = useRef(null);
  const countdownTimerRef = useRef(null);

  const meta  = CHAIN_META[chain.key] ?? { color: '#8B5CF6', short: chain.key.toUpperCase().slice(0, 4) };
  const inProgress = status === 'sending' || status === 'waiting';
  const canDeploy  = !inProgress;

  function clearTimers() {
    if (pollTimerRef.current)      clearTimeout(pollTimerRef.current);
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
  }

  useEffect(() => () => clearTimers(), []);

  function startCountdown(seconds) {
    setCountdown(seconds);
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(countdownTimerRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  const pollForResult = useCallback(async (deadline) => {
    if (Date.now() > deadline) {
      setStatus('error');
      setMessage('Timed out waiting for contract deployment.');
      return;
    }
    try {
      const res  = await fetch(`/api/workflow/${chain.key}/poll`);
      const data = await res.json();
      if (data.deployed && data.chaincode_address) {
        setResult(data);
        setStatus('success');
        setMessage('Contract deployed successfully!');
        onSuccess?.();
        return;
      }
    } catch { /* transient — keep polling */ }
    pollTimerRef.current = setTimeout(() => pollForResult(deadline), POLL_INTERVAL);
  }, [chain.key, onSuccess]);

  async function handleDeploy() {
    if (inProgress) return;
    clearTimers();
    setStatus('sending');
    setMessage('Sending trigger transaction…');
    setResult(null);

    try {
      const res  = await fetch(`/api/workflow/${chain.key}/trigger`, { method: 'POST' });
      const data = await res.json();
      if (!data.success) {
        setStatus('error');
        setMessage(data.message || 'Transaction failed.');
        return;
      }
      setStatus('waiting');
      setMessage('Transaction sent! Waiting for deployment…');
      startCountdown(Math.round(POLL_START_DELAY / 1000));
      const deadline = Date.now() + POLL_TIMEOUT;
      pollTimerRef.current = setTimeout(() => pollForResult(deadline), POLL_START_DELAY);
    } catch (err) {
      setStatus('error');
      setMessage('Network error: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  const statusStyleMap = {
    sending: { bg: '#1E3A5F', border: '#3B82F6', dot: '#3B82F6' },
    waiting: { bg: '#1C3347', border: '#60A5FA', dot: '#60A5FA' },
    success: { bg: '#0A3D2F', border: '#34D399', dot: '#34D399' },
    error:   { bg: '#3D0A0A', border: '#F87171', dot: '#F87171' },
  };
  const statusStyle = statusStyleMap[status];

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-5"
      style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-xl text-xs font-bold shrink-0"
          style={{
            width: 44, height: 44,
            background: meta.color + '22',
            border: `1px solid ${meta.color}55`,
            color: meta.color,
            letterSpacing: '0.05em',
          }}
        >
          {meta.short}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: '#6B5A8E' }}>
            Smart Contract
          </p>
          <h3 className="font-semibold text-white truncate">{chain.displayName}</h3>
          <p className="text-xs mt-0.5" style={{ color: '#4B3A6A' }}>Chain ID: {chain.deployChainId}</p>
        </div>

        <button
          onClick={handleDeploy}
          disabled={!canDeploy}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium shrink-0 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: canDeploy
              ? 'linear-gradient(135deg, #6B3FA0, #8B5CF6)'
              : '#2D1F4E',
            color: canDeploy ? '#fff' : '#6B5A8E',
          }}
        >
          {status === 'sending' ? (
            <><Loader2 size={13} className="animate-spin" /> Sending…</>
          ) : status === 'waiting' ? (
            <><Loader2 size={13} className="animate-spin" /> Deploying…</>
          ) : (
            <><Rocket size={13} /> Deploy</>
          )}
        </button>
      </div>

      {status !== 'idle' && statusStyle && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
          style={{ background: statusStyle.bg, border: `1px solid ${statusStyle.border}`, color: '#CBD5E1' }}
        >
          <span
            className="shrink-0 rounded-full"
            style={{
              width: 7, height: 7,
              background: statusStyle.dot,
              animation: inProgress ? 'pulse 1.2s infinite' : 'none',
            }}
          />
          <span className="flex-1">{message}</span>
          {status === 'waiting' && countdown > 0 && (
            <span style={{ color: '#9B89C4' }}>polling in {countdown}s</span>
          )}
          {status === 'success' && <CheckCircle size={13} style={{ color: '#34D399' }} />}
          {status === 'error'   && <XCircle     size={13} style={{ color: '#F87171' }} />}
        </div>
      )}

      {status === 'success' && result && (
        <div
          className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: '#0F0A1A', border: '1px solid #34D39933' }}
        >
          <ResultRow label="Deployed Address" value={result.chaincode_address} mono green copyable />
          <ResultRow label="Tx Hash"          value={result.txhash}            mono copyable />
          <div className="flex gap-6">
            <ResultRow label="Chain ID"   value={String(result.chain_id)} />
            <ResultRow label="Exec Time"  value={`${result.execution_time}s`} />
          </div>
        </div>
      )}
    </div>
  );
}

function ResultRow({ label, value, mono, green, copyable }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B5A8E' }}>{label}</span>
      <div className="flex items-center gap-2">
        <span
          className="text-xs break-all flex-1"
          style={{
            color:      green ? '#34D399' : '#E2E8F0',
            fontFamily: mono  ? 'monospace' : undefined,
            fontWeight: green ? 600 : undefined,
          }}
        >
          {value}
        </span>
        {copyable && (
          <button onClick={handleCopy} className="shrink-0" title="Copy" style={{ color: copied ? '#34D399' : '#6B5A8E' }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

function ContractHistoryTable({ refreshTick }) {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res  = await fetch('/api/contract-history?limit=20&page=1');
      const data = await res.json();
      setRows(data.deployments ?? []);
      setTotal(data.total ?? 0);
    } catch { /* non-fatal */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory, refreshTick]);

  const fmt = (iso) => new Date(iso).toLocaleString();

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
            {['#', 'Chain', 'Contract Address', 'Tx Hash', 'Exec Time', 'Deployed At'].map(h => (
              <th key={h} className="text-left px-4 py-3 font-semibold uppercase tracking-wider" style={{ color: '#9B89C4' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center" style={{ color: '#6B5A8E' }}>
                No contract deployments yet.
              </td>
            </tr>
          ) : rows.map((r, i) => {
            const meta = CHAIN_META[r.chain_key] ?? { color: '#8B5CF6', short: r.chain_key.slice(0, 4).toUpperCase() };
            return (
              <tr key={r.id}
                style={{ borderBottom: '1px solid #2D1F4E', background: i % 2 === 0 ? '#120C2A' : '#0F0A1A' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1A1035')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#120C2A' : '#0F0A1A')}
              >
                <td className="px-4 py-2.5" style={{ color: '#6B5A8E' }}>{total - i}</td>
                <td className="px-4 py-2.5">
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: meta.color + '22', color: meta.color, border: `1px solid ${meta.color}44` }}
                  >
                    {meta.short}
                  </span>
                  <span className="ml-2" style={{ color: '#9B89C4' }}>{r.chain_name}</span>
                </td>
                <td className="px-4 py-2.5 font-mono" style={{ color: '#34D399' }}>
                  {r.contract_address.slice(0, 8)}…{r.contract_address.slice(-6)}
                  <CopyInline value={r.contract_address} />
                </td>
                <td className="px-4 py-2.5 font-mono" style={{ color: '#8B5CF6' }}>
                  {r.tx_hash ? <>{r.tx_hash.slice(0, 8)}…{r.tx_hash.slice(-6)}<CopyInline value={r.tx_hash} /></> : '—'}
                </td>
                <td className="px-4 py-2.5" style={{ color: '#9B89C4' }}>
                  {r.execution_time ? `${r.execution_time}s` : '—'}
                </td>
                <td className="px-4 py-2.5" style={{ color: '#6B5A8E' }}>{fmt(r.deployed_at)}</td>
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

export default function DeployPage() {
  const [chains,      setChains]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    fetch('/api/chains')
      .then(r => r.json())
      .then((d) => { setChains(d.chains); setLoading(false); })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load chains');
        setLoading(false);
      });
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: '#0F0A1A' }}>
        <header
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ background: '#120C2A', borderBottom: '1px solid #2D1F4E' }}
        >
          <div>
            <h1 className="text-base font-semibold text-white">Deploy Smart Contract</h1>
            <p className="text-xs" style={{ color: '#6B5A8E' }}>Trigger cross-chain contract deployments via Kwala</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="w-8 h-8 rounded-full border-2 animate-spin mx-auto mb-3"
                  style={{ borderColor: '#6B3FA0', borderTopColor: 'transparent' }} />
                <p className="text-sm" style={{ color: '#6B5A8E' }}>Loading chains…</p>
              </div>
            </div>
          ) : error ? (
            <div className="mx-auto max-w-md mt-8 px-4 py-3 rounded-lg text-sm"
              style={{ background: '#3D0A0A', border: '1px solid #F87171', color: '#F87171' }}>
              {error}
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm mb-4" style={{ color: '#6B5A8E' }}>
                  Select a chain and click Deploy — Kwala will trigger the workflow and deploy a smart contract on the target chain.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {chains.map(chain => (
                    <ChainCard key={chain.key} chain={chain} onSuccess={() => setRefreshTick(t => t + 1)} />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <History size={15} style={{ color: '#8B5CF6' }} />
                    <h2 className="font-semibold text-white text-sm">Contract Deployment History</h2>
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
                <ContractHistoryTable refreshTick={refreshTick} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
