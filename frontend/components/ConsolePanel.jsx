'use client';

import { useEffect, useRef } from 'react';
import { Trash2, Terminal, ChevronUp, ChevronDown } from 'lucide-react';

const levelStyle = {
  info:    { color: '#9B89C4', label: 'INFO   ' },
  success: { color: '#34D399', label: 'SUCCESS' },
  error:   { color: '#F87171', label: 'ERROR  ' },
  warning: { color: '#FBBF24', label: 'WARN   ' },
};

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ConsolePanel({ logs, onClear, isOpen, onToggle }) {
  const bottomRef     = useRef(null);
  const containerRef  = useRef(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    if (isOpen && autoScrollRef.current && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  const hasNew = logs.length > 0;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{
        background:  '#0A0715',
        border:      '1px solid #2D1F4E',
        height:      '100%',
        transition:  'box-shadow 0.2s ease',
        boxShadow:   isOpen ? '0 -4px 24px rgba(107,63,160,0.2)' : 'none',
      }}
    >
      {/* Header — always visible, click to toggle */}
      <div
        className="flex items-center justify-between px-4 cursor-pointer select-none shrink-0"
        style={{
          background:   '#120C2A',
          borderBottom: isOpen ? '1px solid #2D1F4E' : 'none',
          height:       '42px',
        }}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <Terminal size={14} style={{ color: '#8B5CF6' }} />
          <span className="text-xs font-semibold" style={{ color: '#9B89C4' }}>CONSOLE OUTPUT</span>
          {hasNew && (
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ background: '#2D1F4E', color: isOpen ? '#6B5A8E' : '#34D399' }}
            >
              {logs.length}
            </span>
          )}
          {!isOpen && hasNew && (
            <span className="text-xs px-2 py-0.5 rounded-full animate-pulse"
              style={{ background: '#1A0F35', color: '#8B5CF6', border: '1px solid #4B2D7A' }}>
              new activity
            </span>
          )}
        </div>

        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
          {/* Traffic lights */}
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#F87171' }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#FBBF24' }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#34D399' }} />
          </div>
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
            style={{ color: '#6B5A8E' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F87171')}
            onMouseLeave={e => (e.currentTarget.style.color = '#6B5A8E')}
          >
            <Trash2 size={11} />
            Clear
          </button>
          <button onClick={onToggle} style={{ color: '#6B5A8E' }}>
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Log area — only rendered when open */}
      {isOpen && (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-3 console-font"
          style={{ minHeight: 0 }}
        >
          {logs.length === 0 && (
            <p className="text-xs" style={{ color: '#4B3A6A' }}>
              Waiting for deployment activity…
            </p>
          )}

          {logs.map((log, i) => {
            const style = levelStyle[log.level];
            return (
              <div key={i} className="flex gap-2 mb-0.5 hover:bg-white/5 px-1 rounded">
                <span className="shrink-0 tabular-nums" style={{ color: '#4B3A6A' }}>
                  {formatTime(log.timestamp)}
                </span>
                <span className="shrink-0 font-medium" style={{ color: style.color }}>
                  [{style.label}]
                </span>
                {log.workflow && (
                  <span className="shrink-0" style={{ color: '#6B5A8E' }}>
                    {log.workflow.replace(/\.(yaml|yml)$/i, '')}
                  </span>
                )}
                <span style={{ color: style.color === '#9B89C4' ? '#C4B5FD' : style.color }}>
                  {log.message}
                </span>
              </div>
            );
          })}

          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
