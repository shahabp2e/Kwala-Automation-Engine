'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, X, Filter, ScrollText, XCircle } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import HistoryTable from '@/components/HistoryTable';
import ConsolePanel from '@/components/ConsolePanel';

const STATUS_OPTIONS = [
  { value: 'all',       label: 'All Status'  },
  { value: 'deployed',  label: 'Deployed'    },
  { value: 'failed',    label: 'Failed'      },
  { value: 'deploying', label: 'Deploying'   },
  { value: 'verifying', label: 'Verifying'   },
];

export default function HistoryPage() {
  const [deployments, setDeployments] = useState([]);
  const [total,  setTotal]   = useState(0);
  const [page,   setPage]    = useState(1);
  const [search, setSearch]  = useState('');
  const [status, setStatus]  = useState('all');
  const [loading, setLoading] = useState(true);

  const [selectedId,   setSelectedId]   = useState(null);
  const [detailLogs,   setDetailLogs]   = useState([]);
  const [loadingLogs,  setLoadingLogs]  = useState(false);

  const LIMIT = 20;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (status !== 'all') qs.set('status', status);
      if (search) qs.set('search', search);
      const res  = await fetch(`/api/history?${qs}`);
      const data = await res.json();
      setDeployments(data.deployments ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => { setPage(1); }, [search, status]);

  const handleViewLogs = async (id) => {
    setSelectedId(id);
    setLoadingLogs(true);
    try {
      const res = await fetch(`/api/history/${id}`);
      const data = await res.json();
      setDetailLogs(data.logs ?? []);
    } finally {
      setLoadingLogs(false);
    }
  };

  const consoleLogs = detailLogs.map(l => ({
    timestamp: l.created_at,
    level:     l.level,
    message:   l.message,
    workflow:  l.workflow ?? undefined,
  }));

  const selectedDeployment = deployments.find(d => d.id === selectedId);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0" style={{ background: '#0F0A1A' }}>
        <header className="flex items-center justify-between px-6 py-3 shrink-0"
          style={{ background: '#120C2A', borderBottom: '1px solid #2D1F4E' }}>
          <div>
            <h1 className="text-base font-semibold text-white">Deployment History</h1>
            <p className="text-xs" style={{ color: '#6B5A8E' }}>{total} total deployments</p>
          </div>
        </header>

        <div className="flex-1 flex gap-0 min-h-0">
          <div className="flex-1 flex flex-col p-5 gap-4 overflow-y-auto min-w-0">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#6B5A8E' }} />
                <input
                  type="text"
                  placeholder="Search workflow name or filename…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 rounded-lg text-sm text-white placeholder:text-[#6B5A8E] outline-none"
                  style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#6B5A8E' }}>
                    <X size={13} />
                  </button>
                )}
              </div>

              <div className="relative">
                <Filter size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#6B5A8E' }} />
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className="pl-8 pr-4 py-2 rounded-lg text-sm outline-none appearance-none cursor-pointer"
                  style={{ background: '#1A1035', border: '1px solid #2D1F4E', color: '#E2D9F3' }}
                >
                  {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="w-6 h-6 rounded-full border-2 animate-spin" style={{ borderColor: '#6B3FA0', borderTopColor: 'transparent' }} />
              </div>
            ) : (
              <HistoryTable
                deployments={deployments}
                total={total}
                page={page}
                limit={LIMIT}
                onPageChange={setPage}
                onViewLogs={handleViewLogs}
              />
            )}
          </div>

          {selectedId !== null && (
            <div className="w-96 shrink-0 flex flex-col" style={{ borderLeft: '1px solid #2D1F4E', background: '#0A0715' }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #2D1F4E', background: '#120C2A' }}>
                <div className="flex items-center gap-2">
                  <ScrollText size={14} style={{ color: '#8B5CF6' }} />
                  <span className="text-xs font-semibold text-white">
                    {selectedDeployment?.workflow_name ?? `Deployment #${selectedId}`}
                  </span>
                </div>
                <button onClick={() => setSelectedId(null)} style={{ color: '#6B5A8E' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#F87171')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#6B5A8E')}>
                  <XCircle size={16} />
                </button>
              </div>

              <div className="flex-1 min-h-0">
                {loadingLogs ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: '#6B3FA0', borderTopColor: 'transparent' }} />
                  </div>
                ) : (
                  <ConsolePanel logs={consoleLogs} onClear={() => setDetailLogs([])} isOpen={true} onToggle={() => {}} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
