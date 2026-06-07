'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, FileText, Trash2, CheckCircle, AlertCircle, Loader2, FolderUp, ClipboardPaste } from 'lucide-react';

function YamlLine({ line }) {
  if (line.trim() === '') return <div>&nbsp;</div>;

  if (/^\s*#/.test(line)) {
    return <div><span style={{ color: '#6A9955' }}>{line}</span></div>;
  }

  const m = line.match(/^(\s*)([\w-]+)(\s*:\s*)(.*)$/);
  if (m) {
    const [, indent, key, colon, value] = m;
    let valueNode = <span style={{ color: '#C4B5FD' }}>{value}</span>;
    const v = value.trim();
    if (!v)                                       valueNode = null;
    else if (/^['"]/.test(v))                     valueNode = <span style={{ color: '#CE9178' }}>{value}</span>;
    else if (/^(true|false|null|~|NA)$/i.test(v)) valueNode = <span style={{ color: '#569CD6' }}>{value}</span>;
    else if (/^-?\d/.test(v))                     valueNode = <span style={{ color: '#B5CEA8' }}>{value}</span>;
    else if (/^0x[0-9a-fA-F]+/.test(v))           valueNode = <span style={{ color: '#4EC9B0' }}>{value}</span>;
    return (
      <div>
        {indent}
        <span style={{ color: '#9CDCFE' }}>{key}</span>
        <span style={{ color: '#6B5A8E' }}>{colon}</span>
        {valueNode}
      </div>
    );
  }

  if (/^\s*-\s/.test(line)) {
    const d = line.match(/^(\s*-\s*)(.*)/);
    if (d) return (
      <div>
        <span style={{ color: '#F87171' }}>{d[1]}</span>
        <span style={{ color: '#C4B5FD' }}>{d[2]}</span>
      </div>
    );
  }

  return <div style={{ color: '#C4B5FD' }}>{line}</div>;
}

function YamlPreview({ content }) {
  const lines = content.split('\n');
  return (
    <div
      className="overflow-auto rounded-lg p-3 console-font text-xs leading-5"
      style={{ background: '#0A0715', border: '1px solid #2D1F4E', maxHeight: 240 }}
    >
      {lines.map((line, i) => (
        <div key={i} className="flex gap-2">
          <span className="select-none shrink-0 w-6 text-right" style={{ color: '#3D2D5A' }}>{i + 1}</span>
          <YamlLine line={line} />
        </div>
      ))}
    </div>
  );
}

export default function UploadModal({ onClose, onUploaded }) {
  const [tab,       setTab]       = useState('upload');

  const [file,         setFile]         = useState(null);
  const [fileContent,  setFileContent]  = useState('');
  const [dragging,     setDragging]     = useState(false);

  const [pasteText,     setPasteText]     = useState('');
  const [pasteFilename, setPasteFilename] = useState('');
  const [filenameError, setFilenameError] = useState('');

  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState('');
  const inputRef    = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab === 'paste') setTimeout(() => textareaRef.current?.focus(), 50);
  }, [tab]);

  const readFile = useCallback((f) => {
    if (!/\.(yaml|yml)$/i.test(f.name)) {
      setError('Only .yaml or .yml files are allowed');
      return;
    }
    setError('');
    setFile(f);
    const reader = new FileReader();
    reader.onload = e => setFileContent((e.target?.result) || '');
    reader.readAsText(f);
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  };

  const handleTabKey = (e) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el  = e.currentTarget;
    const { selectionStart: s, selectionEnd: end, value } = el;
    const next = value.slice(0, s) + '  ' + value.slice(end);
    setPasteText(next);
    requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
  };

  const validateFilename = (name) => {
    if (!name.trim()) return 'Filename is required';
    if (!/^[\w\-. ]+$/i.test(name)) return 'Only letters, numbers, hyphens, underscores allowed';
    if (!/\.(yaml|yml)$/i.test(name)) return 'Filename must end with .yaml or .yml';
    return '';
  };

  const handleUpload = async () => {
    setError('');

    let uploadFile;

    if (tab === 'upload') {
      if (!file) return;
      uploadFile = file;
    } else {
      const fnErr = validateFilename(pasteFilename);
      if (fnErr) { setFilenameError(fnErr); return; }
      if (!pasteText.trim()) { setError('Paste some YAML content first'); return; }
      const name = pasteFilename.trim().endsWith('.yaml') || pasteFilename.trim().endsWith('.yml')
        ? pasteFilename.trim()
        : `${pasteFilename.trim()}.yaml`;
      uploadFile = new File([pasteText], name, { type: 'application/x-yaml' });
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', uploadFile);
      const res  = await fetch('/api/upload-yaml', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onUploaded(uploadFile.name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const canSubmit = tab === 'upload' ? !!file : !!pasteText.trim() && !!pasteFilename.trim();
  const previewContent = tab === 'upload' ? fileContent : pasteText;
  const fmtSize = (b) =>
    b < 1024 ? `${b} B` : `${(b / 1024).toFixed(1)} KB`;

  const tabs = [
    { id: 'upload', icon: <FolderUp size={13} />,       label: 'Upload File'  },
    { id: 'paste',  icon: <ClipboardPaste size={13} />, label: 'Paste YAML'   },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden"
        style={{ background: '#120C2A', border: '1px solid #2D1F4E', maxHeight: '92vh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid #2D1F4E' }}
        >
          <div className="flex items-center gap-2">
            <Upload size={16} style={{ color: '#8B5CF6' }} />
            <span className="font-semibold text-white">Add Workflow YAML</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: '#6B5A8E' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#F87171')}
            onMouseLeave={e => (e.currentTarget.style.color = '#6B5A8E')}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 px-6 pt-4 gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(''); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all"
              style={{
                background: tab === t.id ? '#2D1F4E' : 'transparent',
                color:      tab === t.id ? '#C4B5FD' : '#6B5A8E',
                border:     `1px solid ${tab === t.id ? '#4B2D7A' : 'transparent'}`,
              }}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">

          {/* Upload File tab */}
          {tab === 'upload' && (
            <div
              className="flex flex-col items-center justify-center gap-3 rounded-xl cursor-pointer transition-all"
              style={{
                border:    `2px dashed ${dragging ? '#8B5CF6' : file ? '#34D399' : '#2D1F4E'}`,
                background: dragging ? '#1A0F35' : file ? '#0A1F15' : '#0F0A1A',
                padding:   '2rem 1rem',
                minHeight:  130,
              }}
              onClick={() => inputRef.current?.click()}
              onDragOver={e  => { e.preventDefault(); setDragging(true);  }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".yaml,.yml"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); }}
              />
              {file ? (
                <>
                  <CheckCircle size={32} style={{ color: '#34D399' }} />
                  <div className="text-center">
                    <p className="font-medium text-white">{file.name}</p>
                    <p className="text-xs mt-1" style={{ color: '#6B5A8E' }}>{fmtSize(file.size)}</p>
                  </div>
                  <button
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: '#2D1F4E', color: '#9B89C4' }}
                    onClick={e => { e.stopPropagation(); setFile(null); setFileContent(''); setError(''); }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#F87171')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#9B89C4')}
                  >
                    <Trash2 size={12} /> Remove
                  </button>
                </>
              ) : (
                <>
                  <FileText size={32} style={{ color: dragging ? '#8B5CF6' : '#4B3A6A' }} />
                  <div className="text-center">
                    <p className="text-sm font-medium" style={{ color: dragging ? '#C4B5FD' : '#9B89C4' }}>
                      {dragging ? 'Drop it here!' : 'Drag & drop your .yaml file'}
                    </p>
                    <p className="text-xs mt-1" style={{ color: '#4B3A6A' }}>or click to browse — max 512 KB</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Paste YAML tab */}
          {tab === 'paste' && (
            <>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B5A8E' }}>
                  Filename
                </label>
                <input
                  type="text"
                  placeholder="e.g. MyWorkflow.yaml"
                  value={pasteFilename}
                  onChange={e => { setPasteFilename(e.target.value); setFilenameError(''); }}
                  className="w-full px-3 py-2 rounded-lg text-sm text-white placeholder:text-[#4B3A6A] outline-none"
                  style={{
                    background: '#0F0A1A',
                    border: `1px solid ${filenameError ? '#F87171' : '#2D1F4E'}`,
                  }}
                />
                {filenameError && (
                  <p className="text-xs" style={{ color: '#F87171' }}>{filenameError}</p>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B5A8E' }}>
                  YAML Content
                </label>
                <textarea
                  ref={textareaRef}
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  onKeyDown={handleTabKey}
                  placeholder={'Name: DYNAMIC_NAME_PLACEHOLDER\nTrigger:\n  TriggerChainID: 1905\n  ...'}
                  rows={10}
                  spellCheck={false}
                  className="w-full px-3 py-2.5 rounded-lg text-xs text-white placeholder:text-[#3D2D5A] outline-none resize-y console-font leading-5"
                  style={{
                    background: '#0A0715',
                    border:     '1px solid #2D1F4E',
                    minHeight:  180,
                  }}
                  onFocus={e  => (e.currentTarget.style.borderColor = '#4B2D7A')}
                  onBlur={e   => (e.currentTarget.style.borderColor = '#2D1F4E')}
                />
                <p className="text-xs" style={{ color: '#3D2D5A' }}>
                  {pasteText.split('\n').length} lines · Tab key inserts 2 spaces
                </p>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm shrink-0"
              style={{ background: '#3D0A0A', border: '1px solid #F87171', color: '#F87171' }}
            >
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* YAML Preview */}
          {previewContent.trim() && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#6B5A8E' }}>
                Preview — {previewContent.split('\n').length} lines
              </p>
              <YamlPreview content={previewContent} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid #2D1F4E' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm transition-colors"
            style={{ color: '#9B89C4', background: '#1A1035' }}
            onMouseEnter={e => (e.currentTarget.style.background = '#2D1F4E')}
            onMouseLeave={e => (e.currentTarget.style.background = '#1A1035')}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!canSubmit || uploading}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: canSubmit && !uploading ? 'linear-gradient(135deg,#6B3FA0,#8B5CF6)' : '#4B2D7A' }}
          >
            {uploading
              ? <><Loader2 size={14} className="animate-spin" /> Uploading…</>
              : <><Upload size={14} /> Save Workflow</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
