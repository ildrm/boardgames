import { useLayoutEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ArrowLeft, CircleAlert, LoaderCircle, SlidersHorizontal, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError } from './api';
import { readPreference, unlockAudio, writePreference } from './prefs';

export function Brand() {
  return <Link to="/" className="brand" aria-label="Tablemate">
    <img src="/tablemate.svg" width="34" height="34" alt="" />
    <span translate="no">Tablemate<span className="brand-period">.</span></span>
  </Link>;
}

export function BackLink({ to = '/', children }: { to?: string; children?: ReactNode }) {
  const { t } = useTranslation();
  return <Link className="back-link" to={to}><ArrowLeft size={17} aria-hidden="true" />{children ?? t('common.back')}</Link>;
}

export function useErrorCopy() {
  const { t } = useTranslation();
  return (code: string) => code === 'ROOM_CLOSED' ? t('room.closed') : t('error.' + code, { defaultValue: t('common.error') });
}

export function errorCode(error: unknown) {
  return error instanceof ApiError ? error.code : 'SERVICE_UNAVAILABLE';
}

export function ErrorNotice({ code }: { code: string }) {
  const copy = useErrorCopy();
  return <p className="notice error" role="alert"><CircleAlert size={18} aria-hidden="true" />{copy(code)}</p>;
}

export function Loading() {
  const { t } = useTranslation();
  return <div className="loading" role="status"><LoaderCircle className="spinner" size={22} aria-hidden="true" />{t('common.loading')}</div>;
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const labelId = useId();
  useLayoutEffect(() => {
    const dialog = ref.current;
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (before?.isConnected) before.focus();
    };
  }, []);
  return <dialog ref={ref} className="dialog" aria-labelledby={labelId} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="dialog-heading">
      <h2 id={labelId}>{title}</h2>
      <button className="icon-button" type="button" onClick={onClose} aria-label={t('common.close')}><X size={20} aria-hidden="true" /></button>
    </header>
    {children}
  </dialog>;
}

export function Settings() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState(() => readPreference('theme') ?? 'system');
  const [muted, setMuted] = useState(() => readPreference('sound') !== 'on');
  const [motion, setMotion] = useState(() => readPreference('motion') === 'reduce');
  const currentLanguage = i18n.resolvedLanguage ?? 'en';
  function chooseLanguage(value: string) {
    document.documentElement.lang = value;
    document.documentElement.dir = value === 'fa' ? 'rtl' : 'ltr';
    writePreference('language', value);
    void i18n.changeLanguage(value);
  }
  return <>
    <button className="language-switch" type="button" onClick={() => chooseLanguage(currentLanguage === 'fa' ? 'en' : 'fa')} lang={currentLanguage === 'fa' ? 'en' : 'fa'} aria-label={currentLanguage === 'fa' ? 'Switch to English' : 'تغییر زبان به فارسی'}>
      {currentLanguage === 'fa' ? 'English' : 'فارسی'}
    </button>
    <button className="icon-button" type="button" aria-label={t('theme.settings')} onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}><SlidersHorizontal size={20} aria-hidden="true" /></button>
    {open && <Dialog title={t('theme.settings')} onClose={() => setOpen(false)}>
      <label className="setting">{t('theme.language')}<select value={currentLanguage} onChange={(event) => chooseLanguage(event.target.value)}><option value="en">English</option><option value="fa">فارسی</option></select></label>
      <label className="setting">{t('theme.label')}<select value={theme} onChange={(event) => {
        const next = event.target.value;
        setTheme(next);
        writePreference('theme', next);
        document.documentElement.dataset.theme = next;
      }}>
        {['system', 'light', 'dark'].map((option) => <option key={option} value={option}>{t('theme.' + option)}</option>)}
      </select></label>
      <label className="setting">{t('theme.audio')}<input type="checkbox" checked={!muted} onChange={(event) => {
        const enabled = event.target.checked;
        setMuted(!enabled);
        writePreference('sound', enabled ? 'on' : 'off');
        if (enabled) unlockAudio();
      }} /></label>
      <label className="setting">{t('theme.motion')}<input type="checkbox" checked={motion} onChange={(event) => {
        const reduced = event.target.checked;
        setMotion(reduced);
        writePreference('motion', reduced ? 'reduce' : 'system');
        document.documentElement.dataset.motion = reduced ? 'reduce' : 'system';
      }} /></label>
    </Dialog>}
  </>;
}

export function RulesButton({ gameId }: { gameId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return <>
    <button className="quiet-button" type="button" onClick={(event) => { event.currentTarget.focus(); setOpen(true); }}>{t('match.rules')}</button>
    {open && <Dialog title={t('match.rules') + ' · ' + t('game.' + gameId)} onClose={() => setOpen(false)}>
      <p>{t('match.rules.' + gameId)}</p>
      <p className="muted">{t('match.rules.online')}</p>
    </Dialog>}
  </>;
}

export function SeatMark({ role }: { role?: string }) {
  if (!role) return null;
  const second = role === 'O' || role === 'B';
  return <svg className={'seat-mark ' + (second ? 'piece-b' : 'piece-a')} viewBox="0 0 48 48" aria-hidden="true">
    {role === 'X' && <path d="m13 13 22 22m0-22L13 35" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />}
    {role === 'O' && <circle cx="24" cy="24" r="14" fill="none" stroke="currentColor" strokeWidth="5.5" />}
    {(role === 'A' || role === 'B') && <>
      <circle cx="24" cy="24" r="19" fill="currentColor" />
      {role === 'A' ? <circle className="disc-motif" cx="24" cy="24" r="5" fill="currentColor" /> : <circle className="disc-motif" cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="3" fill="none" />}
    </>}
  </svg>;
}
