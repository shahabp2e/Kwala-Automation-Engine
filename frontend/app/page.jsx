'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Wallet, Wifi, WifiOff, Search, X, Copy, Check, FolderUp } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import WorkflowTable from '@/components/WorkflowTable';
import ConsolePanel from '@/components/ConsolePanel';
import StatsPanel from '@/components/StatsPanel';
import UploadModal from '@/components/UploadModal';
import ToastContainer, { useToast } from '@/components/Toast';
import { PUBLIC_BACKEND_URL as BACKEND } from '@/lib/config';

export default function Dashboard() {
  const [workflows,      setWorkflows]      = useState([]);
  const [filtered,       setFiltered]       = useState([]);
  const [search,         setSearch]         = useState('');
  const [logs,           setLogs]           = useState([]);
  const [stats,          setStats]          = useState(null);
  const [wallet,         setWallet]         = useState(null);
  const [isDeployingAll, setIsDeployingAll] = useState(false);
  const [sseConnected,   setSseConnected]   = useState(false);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [consoleOpen,    setConsoleOpen]    = useState(false);
  const [copied,         setCopied]         = useState(false);
  const [showUpload,     setShowUpload]     = useState(false);

  const eventSourceRef  = useRef(null);
  const refreshTimerRef = useRef(null);
  const { toasts, add: addToast, remove: removeToast } = useToast();

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? workflows.filter(w =>
      w.name.toLowerCase().includes(q) || w.filename.toLowerCase().includes(q)
    ) : workflows);
  }, [workflows, search]);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch('/api/workflows');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setWorkflows(data.workflows ?? []);
      setWallet(data.wallet ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workflows');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) setStats(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    fetchWorkflows();
    fetchStats();
    const interval = setInterval(() => { fetchWorkflows(); fetchStats(); }, 3000);
    return () => clearInterval(interval);
  }, [fetchWorkflows, fetchStats]);

  useEffect(() => {
    let retryTimer;

    const connect = () => {
      const es = new EventSource(`${BACKEND}/logs`);
      eventSourceRef.current = es;

      es.onopen = () => setSseConnected(true);

      es.onerror = () => {
        setSseConnected(false);
        es.close();
        retryTimer = setTimeout(connect, 3000);
      };

      es.onmessage = (e) => {
        try {
          const entry = JSON.parse(e.data);
          setLogs(prev => [...prev.slice(-500), entry]);
          if (entry.level === 'success' || entry.level === 'error') {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(() => {
              fetchWorkflows();
              fetchStats();
            }, 300);
          }
        } catch { /* ignore parse errors */ }
      };
    };

    connect();
    return () => {
      clearTimeout(retryTimer);
      eventSourceRef.current?.close();
    };
  }, [fetchWorkflows, fetchStats]);

  useEffect(() => {
    const anyActive = workflows.some(w => w.status === 'verifying' || w.status === 'deploying');
    if (!anyActive) setIsDeployingAll(false);
  }, [workflows]);

  const handleDeploy = async (filename) => {
    setConsoleOpen(true);
    try {
      const res = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Deploy failed');
      setWorkflows(prev => prev.map(w =>
        w.filename === filename ? { ...w, status: 'verifying', error: undefined } : w
      ));
      addToast('info', 'Deployment started', filename);
    } catch (err) {
      addToast('error', 'Deploy failed', err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (filename) => {
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Delete failed');
      setWorkflows(prev => prev.filter(w => w.filename !== filename));
      addToast('success', 'Workflow deleted', filename);
    } catch (err) {
      addToast('error', 'Delete failed', err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeployAll = async () => {
    setConsoleOpen(true);
    setIsDeployingAll(true);
    try {
      const res = await fetch('/api/deploy-all', { method: 'POST' });
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error || 'Deploy All failed');
      addToast('info', 'Deploy All started', `${d.total} workflows queued`);
    } catch (err) {
      setIsDeployingAll(false);
      addToast('error', 'Deploy All failed', err instanceof Error ? err.message : String(err));
    }
  };

  const prevStatuses = useRef({});
  useEffect(() => {
    workflows.forEach(w => {
      const prev = prevStatuses.current[w.filename];
      if (prev && prev !== w.status) {
        if (w.status === 'deployed')
          addToast('success', 'Deployment successful', w.name);
        else if (w.status === 'failed')
          addToast('error', 'Deployment failed', w.name);
      }
      prevStatuses.current[w.filename] = w.status;
    });
  }, [workflows, addToast]);

  const shortAddr = wallet?.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: '#0F0A1A' }}>
        <header
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ background: '#120C2A', borderBottom: '1px solid #2D1F4E' }}
        >
          <div>
            <h1 className="text-base font-semibold text-white">Dashboard</h1>
            <p className="text-xs" style={{ color: '#6B5A8E' }}>Kwala Workflow Deployment Center</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-xs">
              {sseConnected
                ? <><Wifi    size={12} style={{ color: '#34D399' }} /><span style={{ color: '#34D399' }}>Live</span></>
                : <><WifiOff size={12} style={{ color: '#F87171' }} /><span style={{ color: '#F87171' }}>Reconnecting…</span></>
              }
            </div>
            {wallet && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
                style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}
              >
                <Wallet size={12} style={{ color: '#8B5CF6' }} />
                <button
                  className="flex items-center gap-1.5 transition-colors"
                  title="Copy wallet address"
                  onClick={() => {
                    navigator.clipboard.writeText(wallet.address);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  <span style={{ color: '#9B89C4' }}>{shortAddr}</span>
                  {copied
                    ? <Check size={11} style={{ color: '#34D399' }} />
                    : <Copy  size={11} style={{ color: '#6B5A8E' }} />
                  }
                </button>
                <span
                  className="px-1.5 py-0.5 rounded text-xs font-medium"
                  style={{ background: '#2D1F4E', color: '#34D399' }}
                >
                  {wallet.balance} KWALA
                </span>
              </div>
            )}
            <button
              onClick={() => { fetchWorkflows(); fetchStats(); }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: '#6B5A8E' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#8B5CF6')}
              onMouseLeave={e => (e.currentTarget.style.color = '#6B5A8E')}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </header>

        {error && (
          <div
            className="mx-6 mt-3 px-4 py-2 rounded-lg text-xs shrink-0"
            style={{ background: '#3D0A0A', border: '1px solid #F87171', color: '#F87171' }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className="w-8 h-8 rounded-full border-2 animate-spin mx-auto mb-3"
                style={{ borderColor: '#6B3FA0', borderTopColor: 'transparent' }}
              />
              <p className="text-sm" style={{ color: '#6B5A8E' }}>Loading…</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden p-5 gap-4">

            <div className="flex-1 flex flex-col gap-4 overflow-y-auto min-h-0">
              <StatsPanel stats={stats} />

              <div className="flex gap-2 shrink-0">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6B5A8E' }} />
                  <input
                    type="text"
                    placeholder="Search workflows…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-lg text-sm text-white placeholder:text-[#6B5A8E] outline-none"
                    style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: '#6B5A8E' }}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all shrink-0"
                  style={{ background: 'linear-gradient(135deg,#1A3A5C,#2563EB)' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <FolderUp size={14} />
                  Upload YAML
                </button>
              </div>

              <WorkflowTable
                workflows={filtered}
                onDeploy={handleDeploy}
                onDeployAll={handleDeployAll}
                onDelete={handleDelete}
                isDeployingAll={isDeployingAll}
              />
            </div>

            <div
              className="shrink-0"
              style={{
                height:     consoleOpen ? '320px' : '42px',
                transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                minHeight:  0,
              }}
            >
              <ConsolePanel
                logs={logs}
                onClear={() => setLogs([])}
                isOpen={consoleOpen}
                onToggle={() => setConsoleOpen(v => !v)}
              />
            </div>

          </div>
        )}
      </div>

      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={(filename) => {
            fetchWorkflows();
            addToast('success', 'Workflow uploaded', filename);
          }}
        />
      )}
    </div>
  );
}
