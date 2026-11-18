import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Clock, Play, Trash2, Plus, Headphones, Loader2 } from 'lucide-react';
import { useProjectState, useProjectActions, useUIActions, useSettingsState } from '@/stores';
import { createSampleProject, SAMPLE_SOURCE, SAMPLE_TEXT, SAMPLE_TITLE } from '@/services/sampleProject';
import { segmentText } from '@/services/segmentation';
import { OnDeviceNotice } from '@/components/common/OnDeviceNotice';
import { getAllProjects, deleteProject as deleteProjectFromDB } from '@/db/schema';
import type { Project } from '@/types';
import { useDocumentTitle, APP_TITLE } from '@/hooks/useDocumentTitle';

export function Home() {
  const navigate = useNavigate();
  const { projects } = useProjectState();
  const { setProjects, addProject, removeProject, setCurrentProject, setProjectLoading } = useProjectActions();
  const { setImportModalOpen, addToast } = useUIActions();
  const { defaultProvider, defaultVoiceId } = useSettingsState();
  const [creatingSample, setCreatingSample] = useState(false);
  // True once the first IndexedDB read finishes. The page frame renders from the
  // first paint, so the list area never swaps to a spinner and back (layout shift).
  const [loaded, setLoaded] = useState(false);
  useDocumentTitle(APP_TITLE);

  const handleSample = async () => {
    // Reopen the sample if it is already in the library instead of adding a copy.
    const existing = projects.find((p) => p.title === SAMPLE_TITLE && p.originalContent === SAMPLE_TEXT);
    if (existing) {
      setCurrentProject(existing);
      navigate(`/project/${existing.id}`, { state: { autoplay: true } });
      return;
    }
    setCreatingSample(true);
    try {
      const project = await createSampleProject(defaultProvider, defaultVoiceId);
      addProject(project);
      setCurrentProject(project);
      // The click is the user gesture, so the project page may start playback.
      navigate(`/project/${project.id}`, { state: { autoplay: true } });
    } catch {
      addToast({ type: 'error', message: 'Could not create the sample project' });
      setCreatingSample(false);
    }
  };

  // Load projects from IndexedDB on mount
  useEffect(() => {
    async function loadProjects() {
      setProjectLoading(true);
      try {
        const loadedProjects = await getAllProjects();
        setProjects(loadedProjects);
      } catch (error) {
        console.error('Failed to load projects:', error);
        addToast({ type: 'error', message: 'Failed to load projects' });
      } finally {
        setProjectLoading(false);
        setLoaded(true);
      }
    }

    loadProjects();
  }, [setProjects, setProjectLoading, addToast]);

  const handleOpenProject = (project: Project) => {
    setCurrentProject(project);
    navigate(`/project/${project.id}`);
  };

  // Confirmation happens in the card itself (see ProjectCard), not in a browser dialog.
  const handleDeleteProject = async (project: Project) => {
    try {
      await deleteProjectFromDB(project.id);
      removeProject(project.id);
      addToast({ type: 'success', message: 'Project deleted' });
    } catch {
      addToast({ type: 'error', message: 'Failed to delete project' });
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getEstimatedDuration = (project: Project) => {
    // Rough estimate: ~150 words per minute, ~5 chars per word
    const charCount = project.originalContent.length;
    const minutes = Math.ceil(charCount / (150 * 5));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  // Projects already in the store (for example after going back from a project)
  // show at once. Otherwise the list waits for the first read.
  const pending = !loaded && projects.length === 0;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
        <div>
          <h2 className="font-display text-xl sm:text-2xl font-bold text-text-primary">Your projects</h2>
          <p className="text-sm sm:text-base text-text-secondary mt-1">
            {projects.length === 0
              ? pending
                ? 'Loading your projects'
                : 'Create your first narration project'
              : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {projects.length > 0 && (
          <button
            onClick={handleSample}
            disabled={creatingSample}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-surface-light
                       text-text-primary hover:bg-surface-light transition-colors disabled:opacity-60"
          >
            <Headphones className="w-4 h-4" aria-hidden="true" />
            Play the sample chapter
          </button>
        )}
      </div>

      <OnDeviceNotice className="mb-6" />

      {/* Stays mounted so screen readers announce the text change. */}
      <p role="status" className="sr-only">
        {pending ? 'Loading projects' : ''}
      </p>

      {pending ? (
        // Reserves the empty state's exact height, so the footer does not move when the read finishes.
        <div className="invisible" aria-hidden="true" inert>
          <EmptyState onImport={() => {}} onSample={() => {}} creatingSample={false} />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          onImport={() => setImportModalOpen(true)}
          onSample={handleSample}
          creatingSample={creatingSample}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3 sm:gap-4">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => handleOpenProject(project)}
              onDelete={() => handleDeleteProject(project)}
              formatDate={formatDate}
              getEstimatedDuration={getEstimatedDuration}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyState({
  onImport,
  onSample,
  creatingSample,
}: {
  onImport: () => void;
  onSample: () => void;
  creatingSample: boolean;
}) {
  return (
    <div className="text-center py-10 sm:py-14 px-4 bg-surface-light/50 rounded-xl">
      <Headphones className="w-12 sm:w-14 h-12 sm:h-14 text-primary mx-auto mb-4" aria-hidden="true" />
      <h3 className="font-display text-lg sm:text-xl font-semibold text-text-primary mb-2">
        Hear it before you import anything
      </h3>
      <p className="text-sm sm:text-base text-text-secondary max-w-md mx-auto mb-6">
        Play the opening of <cite>Alice&apos;s Adventures in Wonderland</cite>, or paste an article, chapter or
        document of your own and listen to it with word-by-word highlighting.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          onClick={onSample}
          disabled={creatingSample}
          className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 bg-primary hover:bg-primary-light
                     text-on-primary font-semibold rounded-lg transition-colors touch-target disabled:opacity-70"
        >
          {creatingSample ? (
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="w-5 h-5" aria-hidden="true" />
          )}
          Play the sample chapter
        </button>
        <button
          onClick={onImport}
          className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 border border-surface-light hover:bg-surface-light
                     text-text-primary font-medium rounded-lg transition-colors touch-target"
        >
          <Plus className="w-5 h-5" aria-hidden="true" />
          Use your own text
        </button>
      </div>
      <p className="mt-4 text-xs text-text-secondary">Sample text: {SAMPLE_SOURCE}.</p>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
  formatDate: (date: Date) => string;
  getEstimatedDuration: (project: Project) => string;
}

function ProjectCard({
  project,
  onOpen,
  onDelete,
  formatDate,
  getEstimatedDuration,
}: ProjectCardProps) {
  const preview = project.originalContent.slice(0, 200);
  // Count what the reader shows (segments), not the parser's internal chunks.
  const segmentCount = useMemo(
    () => segmentText(project.originalContent, project.id).length,
    [project.originalContent, project.id],
  );
  const progress = project.lastPosition.chunkIndex / Math.max(segmentCount, 1);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The safe choice takes focus, so Enter twice cannot delete by accident.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirmingDelete) cancelRef.current?.focus();
    else if (wasConfirming.current) deleteRef.current?.focus();
    wasConfirming.current = confirmingDelete;
  }, [confirmingDelete]);

  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        // Only the card itself: Enter on its Play or Delete button must not also open it.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open project: ${project.title}`}
      className="group bg-surface hover:bg-surface-light rounded-xl p-4 sm:p-5 cursor-pointer
                 transition-colors border border-transparent hover:border-surface-light touch-feedback
                 focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="flex-shrink-0 w-10 sm:w-12 h-10 sm:h-12 bg-primary/20 rounded-lg flex items-center justify-center">
          <FileText className="w-5 sm:w-6 h-5 sm:h-6 text-primary" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 sm:gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-text-primary group-hover:text-primary transition-colors truncate">
                {project.title}
              </h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs sm:text-sm text-text-muted">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 sm:w-4 h-3 sm:h-4" />
                  {getEstimatedDuration(project)}
                </span>
                <span>{segmentCount} {segmentCount === 1 ? 'segment' : 'segments'}</span>
                <span className="hidden sm:inline">{formatDate(project.updatedAt)}</span>
              </div>
            </div>

            {/* Action buttons: always visible (not only on hover), with an in-card delete confirmation */}
            {confirmingDelete ? (
              <div
                className="flex items-center gap-2"
                role="group"
                aria-label={`Delete ${project.title}?`}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') setConfirmingDelete(false);
                }}
              >
                <span className="text-xs sm:text-sm text-text-secondary">Delete?</span>
                <button
                  onClick={() => { setConfirmingDelete(false); onDelete(); }}
                  className="touch-target px-3 py-1.5 text-sm font-medium rounded-lg bg-error/15 text-error hover:bg-error/25 transition-colors"
                >
                  Delete
                </button>
                <button
                  ref={cancelRef}
                  onClick={() => setConfirmingDelete(false)}
                  className="touch-target px-3 py-1.5 text-sm rounded-lg text-text-secondary hover:bg-surface-light transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 sm:gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen();
                  }}
                  className="touch-target p-2 text-text-muted hover:text-primary hover:bg-primary/10
                             rounded-lg transition-colors"
                  aria-label={`Play ${project.title}`}
                >
                  <Play className="w-5 h-5" aria-hidden="true" />
                </button>
                <button
                  ref={deleteRef}
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(true);
                  }}
                  className="touch-target p-2 text-text-muted hover:text-error hover:bg-error/10
                             rounded-lg transition-colors"
                  aria-label={`Delete ${project.title}`}
                >
                  <Trash2 className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <p className="mt-2 sm:mt-3 text-xs sm:text-sm text-text-secondary line-clamp-2">
            {preview}...
          </p>

          {/* Progress bar */}
          {progress > 0 && (
            <div className="mt-2 sm:mt-3 h-1 bg-surface-dark rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
