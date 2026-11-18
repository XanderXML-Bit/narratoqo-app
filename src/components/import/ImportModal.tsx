import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, FileText, Link, Clipboard, Loader2, Upload } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useUIState, useUIActions, useProjectActions, useSettingsState } from '@/stores';
import type { Project } from '@/types';
import { saveProject } from '@/db/schema';
import { parseURL, parseFile, getAcceptString } from '@/services/parser';
import { parseTextIntoChunks } from '@/services/parser/textChunks';
import { deriveTitle } from '@/services/parser/deriveTitle';
import { useDialogFocus } from '@/hooks/useDialogFocus';

/** Max text length: 500,000 characters (~100k words, ~8 hours of audio) */
const MAX_TEXT_LENGTH = 500_000;
/** Max file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ImportModal() {
  const navigate = useNavigate();
  const { isImportModalOpen, importState } = useUIState();
  const { setImportModalOpen, setImportState, resetImportState, addToast } = useUIActions();
  const { addProject, setCurrentProject } = useProjectActions();
  const { defaultVoiceId, defaultProvider } = useSettingsState();

  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [importMode, setImportMode] = useState<'paste' | 'url' | 'file'>('paste');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setImportModalOpen(false);
    resetImportState();
    setTitle('');
    setText('');
    setUrl('');
    setIsFetchingUrl(false);
    setUrlError(null);
    setSelectedFile(null);
    setIsParsingFile(false);
  }, [setImportModalOpen, resetImportState]);

  useDialogFocus(dialogRef, isImportModalOpen, handleClose, '#text-input, #project-title');

  if (!isImportModalOpen) return null;

  const handleFetchUrl = async () => {
    if (!url.trim()) {
      addToast({ type: 'error', message: 'Please enter a URL' });
      return;
    }
    if (!isValidUrl(url.trim())) {
      addToast({ type: 'error', message: 'Please enter a valid URL (starting with http:// or https://)' });
      return;
    }

    setIsFetchingUrl(true);
    setUrlError(null);
    try {
      const article = await parseURL(url.trim());
      setText(article.content);
      if (!title.trim() && article.title) {
        setTitle(article.title);
      }
      addToast({ type: 'success', message: 'Article content extracted!' });
    } catch (error) {
      // Shown inline next to the URL field, where the user is looking.
      setUrlError(error instanceof Error ? error.message : 'Failed to fetch URL');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const processFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      addToast({ type: 'error', message: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum size is 10 MB.` });
      return;
    }

    setSelectedFile(file);
    setIsParsingFile(true);

    try {
      const parsed = await parseFile(file);
      setText(parsed.content);
      if (!title.trim() && parsed.title) {
        setTitle(parsed.title);
      }
      addToast({ type: 'success', message: `File "${file.name}" parsed successfully!` });
    } catch (error) {
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to parse file',
      });
      setSelectedFile(null);
    } finally {
      setIsParsingFile(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleImport = async () => {
    if (!text.trim()) {
      addToast({ type: 'error', message: 'Please enter some text to narrate' });
      return;
    }
    if (text.length > MAX_TEXT_LENGTH) {
      addToast({ type: 'error', message: `Text too long (${(text.length / 1000).toFixed(0)}k characters). Maximum is ${(MAX_TEXT_LENGTH / 1000).toFixed(0)}k characters.` });
      return;
    }

    setImportState({ isImporting: true, stage: 'parsing', progress: 0 });

    try {
      // Parse text into chunks (simple sentence-based chunking for now)
      const chunks = parseTextIntoChunks(text.trim());

      setImportState({ progress: 50, stage: 'done' });

      const projectTitle = title.trim() || deriveTitle(text) || `Project ${new Date().toLocaleDateString()}`;

      const project: Project = {
        id: nanoid(),
        title: projectTitle,
        sourceType: 'text',
        originalContent: text.trim(),
        chunks,
        defaultVoiceId,
        defaultProvider,
        lastPosition: { chunkIndex: 0, time: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to IndexedDB
      await saveProject(project);

      // Add to store
      addProject(project);
      setCurrentProject(project);

      setImportState({ progress: 100, stage: 'done' });
      addToast({ type: 'success', message: 'Project created successfully!' });

      // Close modal and navigate to project
      setImportModalOpen(false);
      resetImportState();
      setTitle('');
      setText('');
      navigate(`/project/${project.id}`);
    } catch (error) {
      setImportState({
        isImporting: false,
        stage: 'error',
        error: error instanceof Error ? error.message : 'Import failed',
      });
      addToast({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to import text',
      });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div ref={dialogRef} tabIndex={-1} className="bg-surface-dark rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl outline-none">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-light">
          <h2 id="import-modal-title" className="text-xl font-semibold text-text-primary">New Project</h2>
          <button
            onClick={handleClose}
            aria-label="Close import dialog"
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-light rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Title Input */}
          <div>
            <label htmlFor="project-title" className="block text-sm font-medium text-text-secondary mb-2">
              Project Title (optional)
            </label>
            <input
              id="project-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title for your project..."
              className="w-full px-4 py-3 bg-surface rounded-lg border border-surface-light
                         text-text-primary placeholder-text-muted
                         focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Import Mode Tabs */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setImportMode('paste')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                         ${importMode === 'paste'
                           ? 'bg-primary text-on-primary'
                           : 'bg-surface-light text-text-secondary hover:text-text-primary'}`}
            >
              <Clipboard className="w-4 h-4" />
              Paste Text
            </button>
            <button
              onClick={() => setImportMode('url')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                         ${importMode === 'url'
                           ? 'bg-primary text-on-primary'
                           : 'bg-surface-light text-text-secondary hover:text-text-primary'}`}
            >
              <Link className="w-4 h-4" />
              From URL
            </button>
            <button
              onClick={() => setImportMode('file')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors
                         ${importMode === 'file'
                           ? 'bg-primary text-on-primary'
                           : 'bg-surface-light text-text-secondary hover:text-text-primary'}`}
            >
              <Upload className="w-4 h-4" />
              Upload File
            </button>
          </div>

          {/* Text Input */}
          {importMode === 'paste' && (
            <div>
              <label htmlFor="text-input" className="block text-sm font-medium text-text-secondary mb-2">
                Text Content
              </label>
              <textarea
                id="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste or type your text here..."
                rows={12}
                className="w-full px-4 py-3 bg-surface rounded-lg border border-surface-light
                           text-text-primary placeholder-text-muted resize-none
                           focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className={`mt-2 text-xs ${text.length > MAX_TEXT_LENGTH ? 'text-error' : text.length > MAX_TEXT_LENGTH * 0.9 ? 'text-warning' : 'text-text-muted'}`}>
                {text.trim().length.toLocaleString()} / {MAX_TEXT_LENGTH.toLocaleString()} characters
              </p>
            </div>
          )}

          {importMode === 'url' && (
            <div>
              <label htmlFor="url-input" className="block text-sm font-medium text-text-secondary mb-2">
                URL
              </label>
              <div className="flex gap-2">
                <input
                  id="url-input"
                  type="url"
                  value={url}
                  onChange={(e) => { setUrl(e.target.value); setUrlError(null); }}
                  aria-describedby={urlError ? 'url-error' : undefined}
                  aria-invalid={urlError ? true : undefined}
                  placeholder="https://example.com/article"
                  className="flex-1 px-4 py-3 bg-surface rounded-lg border border-surface-light
                             text-text-primary placeholder-text-muted
                             focus:outline-none focus:ring-2 focus:ring-primary/50"
                  onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()}
                />
                <button
                  className="px-4 py-3 bg-primary hover:bg-primary-light disabled:opacity-50 text-on-primary rounded-lg transition-colors"
                  onClick={handleFetchUrl}
                  disabled={isFetchingUrl || !url.trim()}
                  aria-label={isFetchingUrl ? 'Fetching article' : 'Fetch article'}
                  title="Fetch article"
                >
                  {isFetchingUrl ? (
                    <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  ) : (
                    <FileText className="w-5 h-5" aria-hidden="true" />
                  )}
                </button>
              </div>
              <p role="status" aria-live="polite" className="mt-2 text-sm text-text-secondary empty:hidden">
                {isFetchingUrl ? 'Fetching the page through a public proxy. This can take up to 30 seconds.' : ''}
              </p>
              {urlError && (
                <p id="url-error" role="alert" className="mt-2 text-sm text-error">
                  {urlError}
                </p>
              )}
              <p className="mt-2 text-xs text-text-muted">
                Extracts readable content from web articles and blog posts.
              </p>
              <p className="mt-1 text-xs text-text-muted" data-testid="url-proxy-disclosure">
                The page is fetched through a public CORS proxy (allorigins.win, with corsproxy.io as a fallback), which sees
                the address and the page. Pasted text and uploaded files never leave this device.
              </p>

              {/* Show extracted content preview */}
              {text && importMode === 'url' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Extracted Content
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    className="w-full px-4 py-3 bg-surface rounded-lg border border-surface-light
                               text-text-primary placeholder-text-muted resize-none
                               focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="mt-2 text-xs text-text-muted">
                    {text.trim().length.toLocaleString()} characters - Edit if needed
                  </p>
                </div>
              )}
            </div>
          )}

          {/* File Upload */}
          {importMode === 'file' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept={getAcceptString()}
                onChange={handleFileSelect}
                className="hidden"
              />

              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-surface-light hover:border-primary/50
                           rounded-xl p-8 text-center cursor-pointer transition-colors"
              >
                {isParsingFile ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="text-text-secondary">Parsing file...</p>
                  </div>
                ) : selectedFile ? (
                  <div className="flex flex-col items-center gap-3">
                    <FileText className="w-10 h-10 text-primary" />
                    <p className="text-text-primary font-medium">{selectedFile.name}</p>
                    <p className="text-text-muted text-sm">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-text-muted" />
                    <p className="text-text-primary font-medium">
                      Drop a file here or click to browse
                    </p>
                    <p className="text-text-muted text-sm">
                      Supports: TXT, MD, HTML, PDF*, EPUB*
                    </p>
                    <p className="text-text-muted text-xs">
                      *PDF and EPUB require additional libraries
                    </p>
                  </div>
                )}
              </div>

              {/* Show parsed content preview */}
              {text && importMode === 'file' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Parsed Content
                  </label>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={8}
                    className="w-full px-4 py-3 bg-surface rounded-lg border border-surface-light
                               text-text-primary placeholder-text-muted resize-none
                               focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="mt-2 text-xs text-text-muted">
                    {text.trim().length.toLocaleString()} characters - Edit if needed
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {importState.isImporting && (
            <div className="bg-surface rounded-lg p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-text-secondary">
                  {importState.stage === 'parsing' && 'Parsing text...'}
                  {importState.stage === 'detecting-characters' && 'Detecting characters...'}
                  {importState.stage === 'done' && 'Done!'}
                </span>
                <span className="text-text-muted">{importState.progress}%</span>
              </div>
              <div className="h-2 bg-surface-light rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${importState.progress}%` }}
                />
              </div>
            </div>
          )}

          {importState.error && (
            <div className="bg-error/10 text-error rounded-lg p-4 text-sm">
              {importState.error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-surface-light">
          {!text.trim() && !importState.isImporting && (
            <p className="mr-auto self-center text-xs text-text-muted">
              {importMode === 'url' ? 'Fetch a page to continue.' : importMode === 'file' ? 'Choose a file to continue.' : 'Add some text to continue.'}
            </p>
          )}
          <button
            onClick={handleClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!text.trim() || importState.isImporting}
            className="px-6 py-2 bg-primary hover:bg-primary-light disabled:opacity-50
                       disabled:cursor-not-allowed text-on-primary font-medium rounded-lg transition-colors"
          >
            {importState.isImporting ? 'Importing...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}
