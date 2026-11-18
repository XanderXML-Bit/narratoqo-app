import { useEffect, useRef, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { MainLayout } from '@/components/layout';
import { ToastContainer, OfflineBanner } from '@/components/common';
import { ErrorBoundary, ViewErrorBoundary } from '@/components/ErrorBoundary';
import { Home } from '@/pages/Home';
import { AppPolicy } from '@/pages/AppPolicy';
import { useSettingsState, useSettingsActions } from '@/stores';
import { getTTSFactory } from '@/services/tts';
import { pickFallbackProvider } from '@/services/tts/providerDefaults';

const Project = lazy(() => import('@/pages/Project').then(m => ({ default: m.Project })));
const ImportModal = lazy(() => import('@/components/import').then(m => ({ default: m.ImportModal })));
const SettingsModal = lazy(() => import('@/components/settings').then(m => ({ default: m.SettingsModal })));

function App() {
  const settings = useSettingsState();
  const { setDefaultProvider, setDefaultVoice } = useSettingsActions();
  const checkedProviderRef = useRef(false);

  // Initialize TTS factory with current settings
  useEffect(() => {
    const factory = getTTSFactory({
      openAiApiKey: settings.openAiApiKey,
      geminiApiKey: settings.geminiApiKey,
      elevenLabsApiKey: settings.elevenLabsApiKey,
      playHtApiKey: settings.playHtApiKey,
      playHtUserId: settings.playHtUserId,
      deepgramApiKey: settings.deepgramApiKey,
    });

    // Once per load: if the saved provider can't run (e.g. its API key lived in
    // session storage and is gone), switch to the free on-device voice.
    if (!checkedProviderRef.current) {
      checkedProviderRef.current = true;
      const fallback = pickFallbackProvider(settings.defaultProvider, (p) => factory.isProviderAvailable(p));
      if (fallback) {
        setDefaultProvider(fallback.provider);
        setDefaultVoice(fallback.voiceId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    settings.openAiApiKey,
    settings.geminiApiKey,
    settings.elevenLabsApiKey,
    settings.playHtApiKey,
    settings.playHtUserId,
    settings.deepgramApiKey,
  ]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="/"
            element={
              <MainLayout>
                <ViewErrorBoundary viewName="Home">
                  <Home />
                </ViewErrorBoundary>
              </MainLayout>
            }
          />
          <Route path="/privacy" element={<MainLayout><AppPolicy /></MainLayout>} />
          <Route path="/project/:id" element={
            <Suspense fallback={<div className="flex items-center justify-center h-screen bg-background"><div className="text-muted-foreground">Loading project...</div></div>}>
              <ViewErrorBoundary viewName="Project">
                <Project />
              </ViewErrorBoundary>
            </Suspense>
          } />
        </Routes>

        {/* Global Modals */}
        <Suspense fallback={null}>
          <ViewErrorBoundary viewName="Import">
            <ImportModal />
          </ViewErrorBoundary>
          <ViewErrorBoundary viewName="Settings">
            <SettingsModal />
          </ViewErrorBoundary>
        </Suspense>

        {/* Offline indicator */}
        <OfflineBanner />

        {/* Toast notifications */}
        <ToastContainer />
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
