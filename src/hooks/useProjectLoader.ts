import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProjectActions, usePlayerActions, useSettingsState, useUIActions } from '@/stores';
import { getProject } from '@/db/schema';
import { getAudioCacheManager } from '@/services/audio';
import { segmentText, paginateSegments, type TextSegment, type SegmentPage } from '@/services/segmentation';

const SEGMENTS_PER_PAGE = 5;

export interface UseProjectLoaderResult {
  segments: TextSegment[];
  pages: SegmentPage[];
  initialAudioStatus: Record<number, 'idle' | 'generating' | 'ready'>;
}

/** Loads a project from the database, segments its text, and checks initial audio cache status. */
export function useProjectLoader(projectId: string | undefined): UseProjectLoaderResult {
  const navigate = useNavigate();
  const { setCurrentProject } = useProjectActions();
  const playerActions = usePlayerActions();
  const settings = useSettingsState();
  const { addToast } = useUIActions();

  const [segments, setSegments] = useState<TextSegment[]>([]);
  const [pages, setPages] = useState<SegmentPage[]>([]);
  const [initialAudioStatus, setInitialAudioStatus] = useState<Record<number, 'idle' | 'generating' | 'ready'>>({});

  const audioCacheManager = getAudioCacheManager();

  useEffect(() => {
    async function loadProject() {
      if (!projectId) return;

      try {
        const project = await getProject(projectId);
        if (project) {
          setCurrentProject(project);
          playerActions.setPlayerProjectId(project.id);

          const textSegments = segmentText(project.originalContent, project.id);
          setSegments(textSegments);

          const segmentPages = paginateSegments(textSegments, SEGMENTS_PER_PAGE);
          setPages(segmentPages);

          const cacheFilter = {
            provider: settings.defaultProvider,
            voiceId: settings.defaultVoiceId,
          };
          const audioStatus = await audioCacheManager.prefetch(project.id, cacheFilter);
          if (audioStatus.size > 0) {
            const statusRecord: Record<number, 'idle' | 'generating' | 'ready'> = {};
            textSegments.forEach((_, idx) => {
              statusRecord[idx] = audioStatus.has(idx) ? 'ready' : 'idle';
            });
            setInitialAudioStatus(statusRecord);
          }
        } else {
          addToast({ type: 'error', message: 'Project not found' });
          navigate('/');
        }
      } catch {
        addToast({ type: 'error', message: 'Failed to load project' });
        navigate('/');
      }
    }

    loadProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, setCurrentProject, playerActions, addToast, navigate]);

  return { segments, pages, initialAudioStatus };
}
