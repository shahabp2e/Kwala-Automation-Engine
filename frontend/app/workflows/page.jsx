'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, FolderUp, RefreshCw } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import WorkflowTable from '@/components/WorkflowTable';
import UploadModal from '@/components/UploadModal';
import ToastContainer, { useToast } from '@/components/Toast';
import { PUBLIC_BACKEND_URL as BACKEND } from '@/lib/config';

export default function WorkflowsPage() {
  const [workflows,      setWorkflows]      = useState([]);
  const [search,         setSearch]         = useState('');
  const [filter,         setFilter]         = useState('all');
  const [loading,        setLoading]        = useState(true);
  const [isDeployingAll, setIsDeployingAll] = useState(false);
  const [showUpload,     setShowUpload]     = useState(false);

  const { toasts, add: addToast, remove: removeToast } = useToast();
  const refreshTimerRef = useRef(null);

  const fetchWorkflows = useCallback(async () => {
    try {
      const res  = await fetch('/api/workflows');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setWorkflows(data.workflows ?? []);
    } catch { /* non-fatal */ }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchWorkflows();
    const iv = setInterval(fetchWorkflows, 3000);
    return () => clearInterval(iv);
  }, [fetchWorkflows]);

  useEffect(() => {
    let retryTimer;
    const connect = () => {
      const es = new EventSource(`${BACKEND}/logs`);
      es.onerror  = () => { es.close(); retryTimer = setTimeout(connect, 3000); };
      es.onmessage = (e) => {
        try {
          const entry = JSON.parse(e.data);
          if (entry.level === 'success' || entry.level === 'error') {
            if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
            refreshTimerRef.current = setTimeout(fetchWorkflows, 300);
          }
        } catch { /* ignore */ }
      };
    };
    connect();
    return () => clearTimeout(retryTimer);
  }, [fetchWorkflows]);

  useEffect(() => {
    const anyActive = workflows.some(w => w.status === 'verifying' || w.status === 'deploying');
    if (!anyActive) setIsDeployingAll(false);
  }, [workflows]);

  const counts = {
    all:      workflows.length,
    deployed: workflows.filter(w => w.status === 'deployed').length,
    active:   workflows.filter(w => w.status === 'verifying' || w.status === 'deploying').length,
    failed:   workflows.filter(w => w.status === 'failed').length,
    idle:     workflows.filter(w => w.status === 'idle').length,
  };

  const filtered = workflows.filter(w => {
    const q           = search.toLowerCase();
    const matchSearch = !q || w.name.toLowerCase().includes(q) || w.filename.toLowerCase().includes(q);
    const matchFilter =
      filter === 'all'    ? true :
      filter === 'active' ? (w.status === 'verifying' || w.status === 'deploying') :
                            w.status === filter;
    return matchSearch && matchFilter;
  });

  const handleDeploy = async (filename) => {
    try {
      const res = await fetch('/api/deploy', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ filename }),
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
      const d   = await res.json();
      if (!res.ok) throw new Error(d.error || 'Delete failed');
      setWorkflows(prev => prev.filter(w => w.filename !== filename));
      addToast('success', 'Workflow deleted', filename);
    } catch (err) {
      addToast('error', 'Delete failed', err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeployAll = async () => {
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

  const TABS = [
    { key: 'all',      label: 'All'      },
    { key: 'deployed', label: 'Deployed' },
    { key: 'active',   label: 'Active'   },
    { key: 'failed',   label: 'Failed'   },
    { key: 'idle',     label: 'Idle'     },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden" style={{ background: '#0F0A1A' }}>

        <header
          className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ background: '#120C2A', borderBottom: '1px solid #2D1F4E' }}
        >
          <div>
            <h1 className="text-base font-semibold text-white">Workflows</h1>
            <p className="text-xs" style={{ color: '#6B5A8E' }}>Manage & deploy YAML automation workflows</p>
          </div>
          <button
            onClick={fetchWorkflows}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#6B5A8E' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#8B5CF6')}
            onMouseLeave={e => (e.currentTarget.style.color = '#6B5A8E')}
          >
            <RefreshCw size={14} />
          </button>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-8 h-8 rounded-full border-2 animate-spin mx-auto mb-3"
                style={{ borderColor: '#6B3FA0', borderTopColor: 'transparent' }} />
              <p className="text-sm" style={{ color: '#6B5A8E' }}>Loading workflows…</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden p-5 gap-4">

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex gap-1 p-1 rounded-xl shrink-0" style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}>
                {TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={{
                      background: filter === key ? 'linear-gradient(135deg,#6D28D9,#8B5CF6)' : 'transparent',
                      color:      filter === key ? '#fff' : '#9B89C4',
                    }}
                  >
                    {label} <span style={{ opacity: 0.6 }}>({counts[key]})</span>
                  </button>
                ))}
              </div>

              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6B5A8E' }} />
                <input
                  type="text"
                  placeholder="Search workflows…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-lg text-xs text-white placeholder:text-[#6B5A8E] outline-none"
                  style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#6B5A8E' }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium text-white shrink-0 transition-all"
                style={{ background: 'linear-gradient(135deg,#1A3A5C,#2563EB)' }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >
                <FolderUp size={13} /> Upload YAML
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              <WorkflowTable
                workflows={filtered}
                onDeploy={handleDeploy}
                onDeployAll={handleDeployAll}
                onDelete={handleDelete}
                isDeployingAll={isDeployingAll}
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
