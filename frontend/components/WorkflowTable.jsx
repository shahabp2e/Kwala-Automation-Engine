'use client';

import { useState } from 'react';
import { Rocket, CheckCircle, XCircle, Clock, Loader2, Copy, Check, Trash2 } from 'lucide-react';

const statusConfig = {
  idle:      { label: 'Idle',       color: '#9B89C4', bg: '#2D1F4E', icon: <Clock size={12} /> },
  verifying: { label: 'Verifying',  color: '#60A5FA', bg: '#1E3A5F', icon: <Loader2 size={12} className="animate-spin" /> },
  deploying: { label: 'Deploying',  color: '#FBBF24', bg: '#3D2F0A', icon: <Loader2 size={12} className="animate-spin" /> },
  deployed:  { label: 'Deployed',   color: '#34D399', bg: '#0A3D2F', icon: <CheckCircle size={12} /> },
  failed:    { label: 'Failed',     color: '#F87171', bg: '#3D0A0A', icon: <XCircle size={12} /> },
};

function CopyYamlButton({ filename }) {
  const [state, setState] = useState('idle');

  const handleCopy = async (e) => {
    e.stopPropagation();
    if (state === 'loading' || state === 'copied') return;
    setState('loading');
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(filename)}/yaml`);
      if (!res.ok) throw new Error('Failed');
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  };

  const icon =
    state === 'loading' ? <Loader2 size={12} className="animate-spin" /> :
    state === 'copied'  ? <Check   size={12} /> :
                          <Copy    size={12} />;

  const color =
    state === 'copied' ? '#34D399' :
    state === 'error'  ? '#F87171' :
                         '#6B5A8E';

  const tip =
    state === 'copied' ? 'Copied!' :
    state === 'error'  ? 'Failed'  :
                         'Copy YAML';

  return (
    <button
      onClick={handleCopy}
      title={tip}
      className="p-1.5 rounded-lg transition-colors"
      style={{ color, background: state !== 'idle' ? '#1A1035' : 'transparent' }}
      onMouseEnter={e => { if (state === 'idle') e.currentTarget.style.background = '#1A1035'; }}
      onMouseLeave={e => { if (state === 'idle') e.currentTarget.style.background = 'transparent'; }}
    >
      {icon}
    </button>
  );
}

function StatusBadge({ status }) {
  const cfg = statusConfig[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

export default function WorkflowTable({ workflows, onDeploy, onDeployAll, onDelete, isDeployingAll }) {
  const deployedCount = workflows.filter(w =>
    w.status === 'deployed' ||
    ((w.status === 'verifying' || w.status === 'deploying') && !!w.txHash)
  ).length;
  const failedCount   = workflows.filter(w => w.status === 'failed').length;
  const activeCount   = workflows.filter(w =>
    (w.status === 'verifying' || w.status === 'deploying') && !w.txHash
  ).length;

  const isInProgress  = (s) => s === 'verifying' || s === 'deploying';
  const anyInProgress = workflows.some(w => isInProgress(w.status));

  return (
    <div className="flex flex-col h-full">
      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total',      value: workflows.length, color: '#8B5CF6' },
          { label: 'Deployed',   value: deployedCount,    color: '#34D399' },
          { label: 'Active',     value: activeCount,      color: '#FBBF24' },
          { label: 'Failed',     value: failedCount,      color: '#F87171' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl px-4 py-3 flex items-center justify-between"
            style={{ background: '#1A1035', border: '1px solid #2D1F4E' }}>
            <div>
              <p className="text-xs mb-1" style={{ color: '#9B89C4' }}>{label}</p>
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
            </div>
            <div className="w-8 h-8 rounded-lg opacity-20" style={{ background: color }} />
          </div>
        ))}
      </div>

      {/* Table header + Deploy All */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-white">Workflows</h2>
        <button
          onClick={onDeployAll}
          disabled={isDeployingAll || anyInProgress}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: isDeployingAll || anyInProgress ? '#4B2D7A' : 'linear-gradient(135deg, #6B3FA0, #8B5CF6)' }}
        >
          {isDeployingAll ? (
            <><Loader2 size={14} className="animate-spin" /> Deploying All…</>
          ) : (
            <><Rocket size={14} /> Deploy All</>
          )}
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto rounded-xl" style={{ border: '1px solid #2D1F4E' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: '#1A1035', borderBottom: '1px solid #2D1F4E' }}>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B89C4', width: 40 }}>#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B89C4' }}>Workflow</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B89C4' }}>Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B89C4' }}>Tx Hash</th>
              <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider" style={{ color: '#9B89C4' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((wf, i) => (
              <tr key={wf.filename}
                className="transition-colors"
                style={{ borderBottom: '1px solid #2D1F4E', background: i % 2 === 0 ? '#120C2A' : '#0F0A1A' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#1A1035')}
                onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#120C2A' : '#0F0A1A')}
              >
                <td className="px-4 py-3 text-xs" style={{ color: '#6B5A8E' }}>{i + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{wf.name}</div>
                  <div className="text-xs mt-0.5" style={{ color: '#6B5A8E' }}>{wf.filename}</div>
                  {wf.error && (
                    <div className="text-xs mt-1 truncate max-w-xs" style={{ color: '#F87171' }}>{wf.error}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={wf.status} />
                </td>
                <td className="px-4 py-3">
                  {wf.txHash ? (
                    <span className="text-xs console-font" style={{ color: '#8B5CF6' }}>
                      {wf.txHash.slice(0, 10)}…{wf.txHash.slice(-6)}
                    </span>
                  ) : (
                    <span style={{ color: '#4B3A6A' }}>—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <CopyYamlButton filename={wf.filename} />
                    {wf.isDeletable && (
                      <button
                        onClick={() => onDelete(wf.filename)}
                        disabled={isInProgress(wf.status)}
                        title="Delete workflow"
                        className="p-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{ color: '#F87171' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#3D0A0A'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => onDeploy(wf.filename)}
                      disabled={isInProgress(wf.status)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: isInProgress(wf.status) ? '#4B2D7A' : 'linear-gradient(135deg, #6B3FA0, #8B5CF6)' }}
                    >
                      {isInProgress(wf.status) ? (
                        <><Loader2 size={11} className="animate-spin" /> Running</>
                      ) : (
                        <><Rocket size={11} /> Deploy</>
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {workflows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p style={{ color: '#6B5A8E' }}>No workflow YAML files found.</p>
            <p className="text-xs mt-1" style={{ color: '#4B3A6A' }}>
              Place .yaml files in data/yaml_workflows/
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
