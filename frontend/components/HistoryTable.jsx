'use client';

import { ChevronLeft, ChevronRight, Eye, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';

const statusStyle = {
  deployed:  { color: '#34D399', bg: '#0A3D2F', icon: <CheckCircle size={11} />, label: 'Deployed' },
  failed:    { color: '#F87171', bg: '#3D0A0A', icon: <XCircle     size={11} />, label: 'Failed'   },
  deploying: { color: '#FBBF24', bg: '#3D2F0A', icon: <Loader2     size={11} className="animate-spin" />, label: 'Deploying' },
  verifying: { color: '#60A5FA', bg: '#0A1E3D', icon: <Loader2     size={11} className="animate-spin" />, label: 'Verifying' },
  idle:      { color: '#9B89C4', bg: '#2D1F4E', icon: <Clock       size={11} />, label: 'Idle'     },
};

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function dur(ms) {
  if (!ms) return '—';
  if (ms < 1000)  return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export default function HistoryTable({ deployments, total, page, limit, onPageChange, onViewLogs }) {
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #2D1F4E' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#1A1035', borderBottom: '1px solid #2D1F4E' }}>
              {['#', 'Workflow', 'Status', 'Tx Hash', 'Started', 'Duration', 'Logs'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B89C4' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deployments.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-sm" style={{ color: '#6B5A8E' }}>
                  No deployments found
                </td>
              </tr>
            )}
            {deployments.map((d, i) => {
              const s = statusStyle[d.status] ?? statusStyle.idle;
              return (
                <tr key={d.id}
                  style={{ borderBottom: '1px solid #2D1F4E', background: i % 2 === 0 ? '#120C2A' : '#0F0A1A' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1A1035')}
                  onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#120C2A' : '#0F0A1A')}
                >
                  <td className="px-4 py-3 text-xs" style={{ color: '#6B5A8E' }}>{d.id}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{d.workflow_name}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#6B5A8E' }}>{d.filename}</p>
                    {d.error && <p className="text-xs mt-0.5 truncate max-w-xs" style={{ color: '#F87171' }}>{d.error}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{ color: s.color, background: s.bg }}>
                      {s.icon}{s.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {d.tx_hash
                      ? <span className="text-xs console-font" style={{ color: '#8B5CF6' }}>{d.tx_hash.slice(0, 10)}…{d.tx_hash.slice(-6)}</span>
                      : <span style={{ color: '#4B3A6A' }}>—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#9B89C4' }}>{fmt(d.started_at)}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#9B89C4' }}>{dur(d.duration_ms)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => onViewLogs(d.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors"
                      style={{ color: '#8B5CF6', background: '#2D1F4E' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#3D2F5E')}
                      onMouseLeave={e => (e.currentTarget.style.background = '#2D1F4E')}
                    >
                      <Eye size={11} /> Logs
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: '#6B5A8E' }}>
            Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => onPageChange(page - 1)} disabled={page === 1}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
              style={{ color: '#9B89C4', background: '#1A1035' }}>
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
              return (
                <button key={p} onClick={() => onPageChange(p)}
                  className="w-7 h-7 rounded-lg text-xs font-medium transition-colors"
                  style={p === page ? { background: '#6B3FA0', color: '#fff' } : { background: '#1A1035', color: '#9B89C4' }}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30"
              style={{ color: '#9B89C4', background: '#1A1035' }}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
