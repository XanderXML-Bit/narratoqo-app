import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/** Factual web-app disclosures from README.md and the existing import notice. */
export function AppPolicy() {
  useDocumentTitle('Privacy and app use · Narratoqo');
  return (
    <article className="max-w-4xl mx-auto p-4 sm:p-6 text-text-secondary space-y-6">
      <Link to="/" className="inline-flex min-h-11 items-center text-primary underline underline-offset-2">
        Back to Narratoqo
      </Link>
      <h2 className="text-2xl font-semibold text-text-primary">Narratoqo privacy and app use</h2>
      <p>This page covers the Narratoqo browser app, not the Zendren portfolio website.</p>
      <p>
        Zendren LLC operates Narratoqo. Send questions to{' '}
        <a href="mailto:hello@zendren.net" className="text-primary underline underline-offset-2">
          hello@zendren.net
        </a>
        .
      </p>
      <section id="privacy" className="space-y-3 scroll-mt-6" aria-labelledby="privacy-heading">
        <h3 id="privacy-heading" className="text-xl font-semibold text-text-primary">Privacy and local storage</h3>
        <p>Kokoro and Piper generate narration on your device. Your narration text stays on your device when you use these voices.</p>
        <p>Projects and generated audio are saved in this browser’s IndexedDB. Voice preferences and other settings use localStorage.</p>
        <p>Downloaded models stay in browser storage: Kokoro uses Cache Storage, and Piper uses the Origin Private File System.</p>
        <p>Models and runtimes download from Hugging Face and version-pinned jsDelivr paths.</p>
        <p>Optional cloud voices send your narration text to your selected provider using your own API key.</p>
        <p>Keys use this browser tab’s sessionStorage and are sent only to the selected provider. There is no Narratoqo server.</p>
        <p>URL import sends the article URL through a public CORS proxy to fetch its text. Paste text or open a file to avoid that proxy.</p>
      </section>
      <section id="app-use" className="space-y-3 scroll-mt-6" aria-labelledby="app-use-heading">
        <h3 id="app-use-heading" className="text-xl font-semibold text-text-primary">App use</h3>
        <p>On-device narration needs no account, payment, or API key. The first play downloads a voice model for later use in this browser.</p>
        <p>Optional cloud providers require your own key and bill your provider account. Their data policies apply when you use their services.</p>
        <p>This page describes the app’s existing behavior. It does not add separate legal terms.</p>
      </section>
    </article>
  );
}
