import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import '@fontsource-variable/manrope';
import '@fontsource-variable/vazirmatn';
import '@tablemate/design-tokens/theme.css';
import './styles.css';
import './i18n';
import { Catalog, Create, Join, identityKey, invitations, useIdentity } from './catalog';
import { Room } from './room';
import { Match } from './match';
import { BackLink, Brand, Dialog, ErrorNotice, Settings, errorCode } from './ui';
import { readPreference } from './prefs';
import { request } from './api';

document.documentElement.dataset.theme = readPreference('theme') ?? 'system';
document.documentElement.dataset.motion = readPreference('motion') ?? 'system';

const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, retry: false } } });

function Privacy() {
  const { t } = useTranslation();
  const identity = useIdentity();
  const queries = useQueryClient();
  const [action, setAction] = useState<'revoke' | 'delete' | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!action || pending) return;
    setPending(true);
    setError(null);
    try {
      if (action === 'revoke') await request('/me/session', { method: 'DELETE' });
      else await request('/me/deletion-request', { method: 'POST', body: { confirmed: true } });
      invitations.clear();
      void queries.invalidateQueries({ queryKey: identityKey });
      setSubmitted(true);
    } catch (cause) { setError(errorCode(cause)); }
    finally { setPending(false); setAction(null); }
  }

  return <main className="shell narrow privacy" id="main-content">
    <BackLink />
    <h1>{t('privacy.title')}</h1>
    <p>{t('privacy.sessions')}</p><p>{t('privacy.links')}</p>
    {identity.data && <>
      <p><button type="button" className="button secondary" onClick={(event) => { event.currentTarget.focus(); setAction('revoke'); }}>{t('privacy.revoke')}</button></p>
      <p><button type="button" className="quiet-button" onClick={(event) => { event.currentTarget.focus(); setAction('delete'); }}>{t('privacy.delete')}</button></p>
    </>}
    {submitted && <p role="status">{t('privacy.done')}</p>}
    {error && <ErrorNotice code={error} />}
    {action && <Dialog title={t('privacy.' + action)} onClose={() => setAction(null)}>
      <p>{t('privacy.' + action + 'Prompt')}</p>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={() => setAction(null)}>{t('common.cancel')}</button>
        <button type="button" className="button danger" disabled={pending} onClick={() => void submit()}>{t('privacy.' + action)}</button>
      </div>
    </Dialog>}
  </main>;
}

function RoomRoute() {
  const key = location.pathname;
  return <Room key={key} />;
}

function MatchRoute() {
  const key = location.pathname;
  return <Match key={key} />;
}

function App() {
  const { t } = useTranslation();
  return <>
    <a className="skip-link" href="#main-content">{t('common.skip')}</a>
    <header className="site-header">
      <div className="shell header-content"><Brand /><div className="header-controls"><Settings /></div></div>
    </header>
    <Routes>
      <Route path="/" element={<Catalog />} />
      <Route path="/games/:gameId" element={<Create />} />
      <Route path="/join" element={<Join />} />
      <Route path="/rooms/:roomId" element={<RoomRoute />} />
      <Route path="/matches/:matchId" element={<MatchRoute />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="*" element={<main className="shell narrow" id="main-content"><BackLink /><ErrorNotice code="NOT_FOUND_OR_FORBIDDEN" /></main>} />
    </Routes>
    <footer className="site-footer"><div className="shell footer-content"><span>Tablemate</span><Link to="/privacy">{t('catalog.privacy')}</Link></div></footer>
  </>;
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<QueryClientProvider client={client}><BrowserRouter><App /></BrowserRouter></QueryClientProvider>);
