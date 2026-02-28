import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, CheckCircle, AlertCircle, FileSpreadsheet, Trash2, Database, Zap } from 'lucide-react';
import clsx from 'clsx';
import { projectionsApi } from '@/api/client';

type FileType = 'hitters' | 'pitchers' | 'auto';
type StatcastType = 'hitter' | 'pitcher';
type UploadStatus = 'idle' | 'uploading' | 'success' | 'error';

interface SavedFile {
  filename: string;
  file_type: string;
  original_name: string;
  size_kb: number;
  category?: 'projection' | 'statcast';
}

export default function ProjectionUploader({ onUploaded }: { onUploaded?: () => void }) {
  const [fileType, setFileType] = useState<FileType>('auto');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [message, setMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [savedFiles, setSavedFiles] = useState<SavedFile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Statcast upload state
  const [statcastType, setStatcastType] = useState<StatcastType>('hitter');
  const [statcastStatus, setStatcastStatus] = useState<UploadStatus>('idle');
  const [statcastMessage, setStatcastMessage] = useState('');
  const [isStatcastDragging, setIsStatcastDragging] = useState(false);
  const statcastInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      const res = await projectionsApi.getFiles();
      setSavedFiles(res.data.files ?? []);
    } catch { /* Not critical */ }
  };

  useEffect(() => { fetchFiles(); }, []);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setStatus('error');
        setMessage('Please upload a CSV file.');
        return;
      }
      setStatus('uploading');
      setMessage(`Uploading ${file.name}...`);
      try {
        const typeMap = { auto: undefined, hitters: 'hitting', pitchers: 'pitching' } as const;
        const typeParam = typeMap[fileType];
        const res = await projectionsApi.upload(file, typeParam);
        setStatus('success');
        setMessage(`${file.name} — ${res.data.player_count} AL players loaded (${res.data.total_in_pool} total)`);
        await fetchFiles();
        onUploaded?.();
      } catch (err: unknown) {
        setStatus('error');
        const msg = err instanceof Error ? err.message : 'Upload failed';
        setMessage(msg);
      }
    },
    [fileType, onUploaded],
  );

  const handleDeleteFile = async (filename: string) => {
    try {
      await projectionsApi.deleteFile(filename);
      await fetchFiles();
      onUploaded?.();
    } catch { /* Handle error */ }
  };

  const handleClearAll = async () => {
    try {
      await projectionsApi.clearAll(true);
      setSavedFiles([]);
      onUploaded?.();
      setStatus('idle');
      setMessage('');
    } catch { /* Handle error */ }
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleStatcastFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setStatcastStatus('error');
        setStatcastMessage('Please upload a CSV file.');
        return;
      }
      setStatcastStatus('uploading');
      setStatcastMessage(`Merging ${file.name}...`);
      try {
        const res = await projectionsApi.uploadStatcast(file, statcastType);
        setStatcastStatus('success');
        const { matched, unmatched, unmatched_names } = res.data;
        let msg = `Matched ${matched} ${statcastType}s`;
        if (unmatched > 0) {
          msg += ` (${unmatched} unmatched`;
          if (unmatched_names?.length > 0) msg += `: ${unmatched_names.slice(0, 5).join(', ')}`;
          if (unmatched > 5) msg += '...';
          msg += ')';
        }
        setStatcastMessage(msg);
        await fetchFiles();
        onUploaded?.();
      } catch (err: unknown) {
        setStatcastStatus('error');
        const msg = err instanceof Error ? err.message : 'Upload failed — make sure projections are loaded first';
        setStatcastMessage(msg);
      }
    },
    [statcastType, onUploaded],
  );

  const onStatcastDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsStatcastDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleStatcastFile(file);
    },
    [handleStatcastFile],
  );

  return (
    <div className="wr-card">
      <div className="wr-card-header">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-gold/10">
            <FileSpreadsheet className="h-4 w-4 text-gold" />
          </div>
          <span className="wr-title">Projections</span>
        </div>
      </div>

      <div className="wr-card-body space-y-4">
        {/* Saved files */}
        {savedFiles.length > 0 && (
          <div className="rounded border border-border bg-dugout p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                <Database className="h-3 w-3" />
                Persisted Data
              </span>
              <button onClick={handleClearAll} className="text-[11px] font-medium text-big-overpay hover:text-red-400 transition-colors">
                Clear All
              </button>
            </div>
            <div className="space-y-1">
              {savedFiles.map((f) => (
                <div key={f.filename} className="flex items-center justify-between rounded bg-surface px-3 py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      'pos-badge',
                      f.category === 'statcast'
                        ? 'bg-value/20 text-value'
                        : f.file_type === 'hitting' ? 'pos-of' : 'pos-sp',
                    )}>
                      {f.category === 'statcast'
                        ? (f.file_type === 'hitter' ? 'SC-H' : 'SC-P')
                        : (f.file_type === 'hitting' ? 'BAT' : 'PIT')}
                    </span>
                    <span className="text-text-primary text-sm">{f.original_name}</span>
                    <span className="text-text-muted text-xs font-mono">{f.size_kb}kb</span>
                  </div>
                  <button
                    onClick={() => handleDeleteFile(f.filename)}
                    className="text-text-muted hover:text-big-overpay transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* File type radio */}
        <div className="flex gap-2">
          {(['auto', 'hitters', 'pitchers'] as FileType[]).map((ft) => (
            <button
              key={ft}
              onClick={() => setFileType(ft)}
              className={clsx('wr-chip', fileType === ft && 'wr-chip-active')}
            >
              {ft === 'auto' ? 'Auto-detect' : ft.charAt(0).toUpperCase() + ft.slice(1)}
            </button>
          ))}
        </div>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'flex flex-col items-center justify-center rounded border-2 border-dashed p-8 cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-gold bg-gold/5'
              : 'border-border hover:border-border-bright bg-dugout',
          )}
        >
          <Upload className={clsx('mb-3 h-8 w-8', isDragging ? 'text-gold' : 'text-text-muted')} />
          <p className="text-sm text-text-secondary">
            Drop CSV here or <span className="text-gold font-medium cursor-pointer">browse</span>
          </p>
          <p className="text-[11px] text-text-muted mt-1">Replaces previous file of same type</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {/* Status */}
        {status !== 'idle' && (
          <div className={clsx(
            'flex items-center gap-2 text-sm rounded px-3 py-2 border',
            status === 'uploading' && 'border-gold/30 bg-gold/5 text-gold',
            status === 'success' && 'border-steal/30 bg-steal/5 text-steal',
            status === 'error' && 'border-big-overpay/30 bg-big-overpay/5 text-big-overpay',
          )}>
            {status === 'success' && <CheckCircle className="h-4 w-4" />}
            {status === 'error' && <AlertCircle className="h-4 w-4" />}
            {status === 'uploading' && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            )}
            {message}
          </div>
        )}
      </div>

      {/* Statcast / Advanced Metrics Upload */}
      <div className="border-t border-border">
        <div className="wr-card-header">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-value/10">
              <Zap className="h-4 w-4 text-value" />
            </div>
            <div>
              <span className="wr-title">Breakout Data</span>
              <p className="text-[10px] text-text-muted mt-0.5">Statcast / advanced metrics for breakout detection</p>
            </div>
          </div>
        </div>

        <div className="wr-card-body space-y-3">
          <div className="flex gap-2">
            {([{ label: 'Hitters', value: 'hitter' as StatcastType }, { label: 'Pitchers', value: 'pitcher' as StatcastType }]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatcastType(opt.value)}
                className={clsx('wr-chip', statcastType === opt.value && 'wr-chip-active')}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="rounded border border-border bg-dugout px-3 py-2 text-[11px] text-text-muted">
            {statcastType === 'hitter'
              ? 'Needs: Name, Age, Barrel%, HardHit%, xBA, xSLG, xwOBA, Spd'
              : 'Needs: Name, Age, Stuff+, K%, CSW%, Location+, xERA, SwStr%'}
          </div>

          <div
            onDrop={onStatcastDrop}
            onDragOver={(e) => { e.preventDefault(); setIsStatcastDragging(true); }}
            onDragLeave={() => setIsStatcastDragging(false)}
            onClick={() => statcastInputRef.current?.click()}
            className={clsx(
              'flex flex-col items-center justify-center rounded border-2 border-dashed p-6 cursor-pointer transition-all duration-200',
              isStatcastDragging
                ? 'border-value bg-value/5'
                : 'border-border hover:border-border-bright bg-dugout',
            )}
          >
            <Zap className={clsx('mb-2 h-6 w-6', isStatcastDragging ? 'text-value' : 'text-text-muted')} />
            <p className="text-sm text-text-secondary">
              Drop {statcastType} Statcast CSV or <span className="text-value font-medium cursor-pointer">browse</span>
            </p>
            <p className="text-[10px] text-text-muted mt-1">Merges into existing player pool by name match</p>
            <input
              ref={statcastInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleStatcastFile(file);
              }}
            />
          </div>

          {statcastStatus !== 'idle' && (
            <div className={clsx(
              'flex items-center gap-2 text-sm rounded px-3 py-2 border',
              statcastStatus === 'uploading' && 'border-gold/30 bg-gold/5 text-gold',
              statcastStatus === 'success' && 'border-steal/30 bg-steal/5 text-steal',
              statcastStatus === 'error' && 'border-big-overpay/30 bg-big-overpay/5 text-big-overpay',
            )}>
              {statcastStatus === 'success' && <CheckCircle className="h-4 w-4" />}
              {statcastStatus === 'error' && <AlertCircle className="h-4 w-4" />}
              {statcastStatus === 'uploading' && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gold border-t-transparent" />
              )}
              {statcastMessage}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
