import { useState, useEffect, useRef, Component } from 'react';
import { useStore }        from './store';
import { getTheme }        from './data/theme';
import HabitsScreen        from './screens/HabitsScreen';
import TasksScreen         from './screens/TasksScreen';
import CalendarStatsScreen from './screens/CalendarStatsScreen';
import WellbeingScreen     from './screens/WellbeingScreen';
import SettingsScreen      from './screens/SettingsScreen';
import AuthScreen          from './screens/AuthScreen';
import { supabase, signOut, getUser, onAuthStateChange, updatePassword } from './lib/supabase';
import { pullAllData, pushAllData, mergePull, pullFullState, hasSyncState, resetSyncState, mergeFromCloud, deleteAllUserData } from './lib/sync';
import { captureError } from './lib/errors';

class AppErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '24px', fontFamily: 'sans-serif', background: '#fff1f2', minHeight: '100dvh' }}>
          <p style={{ fontWeight: 'bold', color: '#b91c1c', marginBottom: 8 }}>⚠️ Something went wrong</p>
          <p style={{ fontSize: 12, color: '#991b1b', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 12 }}>
            {this.state.error.message}
          </p>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Screenshot this and share it to get it fixed.</p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 16, padding: '8px 16px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
          >Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const savedTab   = useStore(s => s.defaultTab) || 'habits';
  const defaultTab = savedTab === 'calendar' ? 'tracker' : savedTab; // 'calendar' = old name of the Tracker tab
  const [tab, setTab]                 = useState(defaultTab);
  const [settingsFocus, setSettingsFocus] = useState(null); // e.g. 'scoring' from the Tracker colour key
  const [showAuth, setShowAuth]       = useState(false);
  const [authUser, setAuthUser]       = useState(null);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState('');
  const [syncConflict, setSyncConflict]     = useState(null); // { remoteData, userId }
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetNewPassword, setResetNewPassword]   = useState('');
  const [resetShowPassword, setResetShowPassword] = useState(false);
  const [resetLoading, setResetLoading]           = useState(false);
  const [resetError, setResetError]               = useState('');
  const [resetSuccess, setResetSuccess]           = useState(false);

  const darkMode = useStore(s => s.darkMode);
  const gamify   = useStore(s => s.gamify);
  const theme    = getTheme(darkMode);

  const notifications    = useStore(s => s.notifications);
  const hydrateFromSupabase = useStore(s => s.hydrateFromSupabase);

  const syncTimerRef = useRef(null);
  const authUserRef  = useRef(null);
  const pushInFlightRef = useRef(false);
  const applyingRemoteRef = useRef(false); // true while hydrating FROM the cloud (so we don't mark that as a local edit)

  // ── System UI follows the in-app theme ─────────────────────────────────────
  // Dark mode only painted the React tree; <html>/<body> stayed white with no
  // color-scheme, so Android drew a light system nav bar. Tell the browser.
  // (index.html applies the same thing before first paint.)
  useEffect(() => {
    const bg = darkMode ? '#111827' : '#f4f5f7';
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', darkMode ? '#111827' : '#3b82f6');
    // Android's button bar comes from the manifest, not the page — point Chrome at the matching one.
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', darkMode ? './manifest-dark.json' : './manifest.json');
  }, [darkMode]);

  // ── Dev tab title ──────────────────────────────────────────────────────────
  useEffect(() => {
    const host = window.location.hostname;
    const isPreview = host.includes('momentum-daily.pages.dev') && host !== 'momentum-daily.pages.dev';
    if (isPreview) document.title = '(Dev) Momentum Daily';
  }, []);

  // ── Auth: check existing session on boot ───────────────────────────────────
  useEffect(() => {
    // UI only. authUserRef is set by INITIAL_SESSION below — setting it here too could
    // win the race and make that handler think the user was already known, skipping
    // the startup sync.
    getUser().then(user => { if (user) setAuthUser(user); }); // offline null mustn't sign the UI out

    const { data: { subscription } } = onAuthStateChange(async (event, user) => {
      if (event === 'PASSWORD_RECOVERY') {
        setShowResetPassword(true);
        return;
      }
      const prev = authUserRef.current;
      authUserRef.current = user;
      setAuthUser(user);

      if (user && !prev) {
        // Session restore on app load: upload this device's pending changes, then
        // pull only what changed elsewhere (sync v2, lib/sync.js).
        if (event === 'INITIAL_SESSION') {
          localStorage.setItem('momentumLastUserId', user.id);
          try { await syncNow(user.id); }
          catch (err) { captureError(err, { context: 'initialSync' }); }
          return;
        }
      }

      // Explicit sign-in only beyond this point
      if (event === 'SIGNED_IN' && user && !prev) {
        setSyncing(true);
        try {
          // Detect if a different user signed in — if so, clear local data first
          const lastUserId = localStorage.getItem('momentumLastUserId');
          const isNewUser = lastUserId && lastUserId !== user.id;
          if (isNewUser) {
            hydrateFromSupabase({ activities: [], tasks: [], tags: [], logs: {}, checkIns: {}, journalEntries: [] });
          }
          localStorage.setItem('momentumLastUserId', user.id);
          resetSyncState(); // the next sync starts this device's v2 snapshot from scratch

          const remoteData = await pullFullState(user.id);
          const localActivities = isNewUser ? [] : (useStore.getState().activities || []);
          const cloudHasData = remoteData.activities?.length > 0;
          const localHasData = localActivities.filter(a => a.name || a.label).length > 0;

          if (cloudHasData && localHasData) {
            // Both have data — only show conflict dialog if activity sets genuinely differ
            const localIds = new Set(localActivities.map(a => a.id));
            const cloudIds = new Set(remoteData.activities.map(a => a.id));
            const genuineConflict = remoteData.activities.some(a => !localIds.has(a.id)) ||
                                    localActivities.some(a => !cloudIds.has(a.id));
            if (genuineConflict) {
              setSyncing(false);
              setSyncConflict({ remoteData, userId: user.id });
            } else {
              // Same activity set — merge silently
              const merged = await mergeFromCloud(user.id, useStore.getState());
              hydrateFromSupabase(merged);
              setSyncMsg('✓ Synced');
              setSyncing(false);
              setTimeout(() => setSyncMsg(''), 3000);
            }
          } else if (cloudHasData) {
            // Only cloud has data (fresh install or different user) — pull silently
            hydrateFromSupabase(remoteData);
            setSyncMsg('✓ Synced from cloud');
            setSyncing(false);
            setTimeout(() => setSyncMsg(''), 4000);
          } else if (localHasData) {
            // Cloud empty, local has data, same user — push local up (first ever backup)
            await pushAllData(user.id, useStore.getState());
            setSyncMsg('✓ Data backed up to cloud');
            setSyncing(false);
            setTimeout(() => setSyncMsg(''), 4000);
          } else {
            // Both empty — new account, nothing to do
            setSyncing(false);
          }
        } catch (err) {
          captureError(err, { context: 'loginSync' });
          setSyncMsg('Sync failed — working offline');
          setSyncing(false);
          setTimeout(() => setSyncMsg(''), 4000);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Background sync: push on every store change (debounced 1s) ────────────
  // Closing the app right after an edit used to lose it: the push waited 3s and
  // never ran, and on Android the local save itself may not reach disk before the
  // app is killed — so on reopen a pull brought back the old cloud copy. Now the
  // push goes out after 1s, or immediately when the app is hidden/closed.
  useEffect(() => {
    function pushNow() {
      if (syncTimerRef.current) { clearTimeout(syncTimerRef.current); syncTimerRef.current = null; }
      const user = authUserRef.current;
      if (!user) return;
      pushInFlightRef.current = true;
      pushAllData(user.id, useStore.getState())
        .then(() => { try { localStorage.setItem('momentum-unpushed', '0'); } catch { /* ignore */ } })
        .catch(err => captureError(err, { context: 'backgroundPush' }))
        .finally(() => { pushInFlightRef.current = false; });
    }
    const unsubscribe = useStore.subscribe(() => {
      if (applyingRemoteRef.current) return; // change came FROM a cloud pull — don't mark dirty or re-push
      // Mark local dirty NOW (synchronous, survives an app close before the push)
      // so a later pull can't overwrite work that never reached the cloud. Done even
      // before the session is restored: an edit in the first moment after opening
      // must still block the startup pull.
      try { localStorage.setItem('momentum-unpushed', '1'); } catch { /* ignore */ }
      if (!authUserRef.current) return;
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(pushNow, 1000);
    });
    // Leaving the app: send any pending push right away instead of waiting.
    function flushOnHide() { if (document.visibilityState === 'hidden' && syncTimerRef.current) pushNow(); }
    document.addEventListener('visibilitychange', flushOnHide);
    window.addEventListener('pagehide', flushOnHide);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', flushOnHide);
      window.removeEventListener('pagehide', flushOnHide);
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  // ── Push: local → cloud (local wins) ─────────────────────────────────────
  async function handlePushToCloud(arg) {
    // Wired straight to onClick, so arg is usually the click event — only accept a real id.
    const userId = typeof arg === 'string' ? arg : authUser?.id;
    if (!userId || syncing) return;
    setSyncing(true);
    try {
      // Manual Push = upload everything, not just changes (a rescue if the cloud is behind).
      resetSyncState();
      await pushAllData(userId, useStore.getState());
      try { localStorage.setItem('momentum-unpushed', '0'); } catch { /* ignore */ }
      setSyncMsg('✓ Pushed to cloud');
    } catch (err) {
      captureError(err, { context: 'manualPush' });
      setSyncMsg('Push failed — check connection');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  }

  // Merge pulled rows into the CURRENT store (sync v2: only changed rows arrive, and
  // rows with unpushed local edits are skipped — the local edit is pushed and wins).
  function applyRemote(remote, opts) {
    const patch = mergePull(remote, useStore.getState(), opts);
    if (!Object.keys(patch).length) return;
    applyingRemoteRef.current = true; // a cloud change, not a user edit
    hydrateFromSupabase(patch);
    applyingRemoteRef.current = false;
  }

  // Push this device's changes, then pull everyone else's. A device's first v2 sync
  // pulls everything: if it had no unsaved edits the cloud copy wins (it may be
  // stale); if it did, they're uploaded first, as before.
  async function syncNow(userId) {
    if (!hasSyncState(userId)) {
      let unpushed = false;
      try { unpushed = localStorage.getItem('momentum-unpushed') === '1'; } catch { /* ignore */ }
      if (unpushed) await pushAllData(userId, useStore.getState());
      applyRemote(await pullAllData(userId), { remoteWins: !unpushed });
    } else {
      await pushAllData(userId, useStore.getState());
      applyRemote(await pullAllData(userId));
    }
    try { localStorage.setItem('momentum-unpushed', '0'); } catch { /* ignore */ }
  }

  // ── Pull: cloud → local (overwrites local — use on new device setup) ──────
  async function handlePullFromCloud() {
    if (!authUser || syncing) return;
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setSyncMsg('Session expired — sign out and back in');
        setSyncing(false);
        setTimeout(() => setSyncMsg(''), 4000);
        return;
      }
      // Manual Pull = take the cloud copy of everything (unsaved local-only items stay
      // and are uploaded on the next save).
      resetSyncState();
      const remoteData = await pullAllData(authUser.id);
      const hasData = remoteData.rows.activities.length > 0 || remoteData.rows.tasks.length > 0;
      if (hasData) {
        applyRemote(remoteData, { remoteWins: true });
        setSyncMsg('✓ Pulled from cloud');
      } else {
        setSyncMsg('No cloud data found');
      }
    } catch (err) {
      captureError(err, { context: 'manualPull' });
      setSyncMsg('Pull failed — check connection');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  }

  // ── Auto-update on focus: push this device's changes, then pull only rows that
  // changed elsewhere. Safe with unsaved edits — those rows are skipped by the merge.
  useEffect(() => {
    let busy = false;
    async function autoPullIfIdle() {
      if (document.visibilityState !== 'visible' || busy) return;
      const user = authUserRef.current;
      if (!user) return;
      busy = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        await syncNow(user.id);
      } catch (err) {
        captureError(err, { context: 'autoSync' });
      } finally {
        busy = false;
      }
    }
    function onVisible() { if (document.visibilityState === 'visible') autoPullIfIdle(); }
    document.addEventListener('visibilitychange', onVisible);
    // No periodic polling. The old 60s interval re-downloaded the FULL dataset
    // (incl. all log history) every minute an app was open, which blew the
    // Supabase egress quota. Pull on focus/visibility only — you still get fresh
    // data every time you open or return to the app.
    return () => { document.removeEventListener('visibilitychange', onVisible); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sign out ──────────────────────────────────────────────────────────────
  async function handleSignOut() {
    await signOut();
    setAuthUser(null);
    authUserRef.current = null;
  }

  async function handleDeleteAccount() {
    const userId = authUser?.id;
    if (!userId) return;
    try {
      await deleteAllUserData(userId);
      await signOut();
      setAuthUser(null);
      authUserRef.current = null;
    } catch (err) {
      captureError(err, { context: 'deleteAccount' });
    }
  }

  // ── Schedule browser notifications for today ───────────────────────────────
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const timeouts = [];
    const now = new Date();
    notifications.filter(n => n.enabled && n.time).forEach(n => {
      const [h, m] = n.time.split(':').map(Number);
      const target = new Date();
      target.setHours(h, m, 0, 0);
      if (target > now) {
        const id = setTimeout(() => {
          new Notification('Momentum Daily', {
            body: n.message || 'Time for your check-in!',
            icon: '/icon-192.png',
          });
        }, target - now);
        timeouts.push(id);
      }
    });
    return () => timeouts.forEach(clearTimeout);
  }, [notifications]);

  const TAB_ORDER = ['habits', 'tasks', 'tracker', 'wellbeing', 'settings'];
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(deltaX) < 50 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
    const idx = TAB_ORDER.indexOf(tab);
    if (deltaX < 0 && idx < TAB_ORDER.length - 1) setTab(TAB_ORDER[idx + 1]);
    if (deltaX > 0 && idx > 0)                     setTab(TAB_ORDER[idx - 1]);
  }

  const TABS = [
    { id: 'habits',    icon: gamify ? '⚔️' : '☀️', label: gamify ? 'Quests'    : 'Habits'    },
    { id: 'tasks',     icon: gamify ? '📜' : '✅', label: gamify ? 'Contracts' : 'Tasks'     },
    { id: 'tracker',   icon: '📅',                  label: 'Tracker'                          },
    { id: 'wellbeing', icon: gamify ? '🏕️' : '🏛️',  label: gamify ? 'Tavern' : 'Sanctum'     },
    { id: 'settings',  icon: '⚙️',                  label: 'Settings'                         },
  ];

  return (
    <AppErrorBoundary>
    <div className={`h-[100dvh] flex flex-col ${theme.bg}`}>

      {/* Top header */}
      <div className={`flex-shrink-0 px-4 pb-3 border-b flex items-center justify-between ${theme.header}`} style={{ paddingTop: 'calc(0.75rem + env(safe-area-inset-top))' }}>
        <div className="w-16">
          {syncing && (
            <span className={`text-[10px] ${theme.muted}`}>Syncing…</span>
          )}
          {!syncing && syncMsg && (
            <span className={`text-[10px] ${theme.muted}`}>{syncMsg}</span>
          )}
        </div>
        <span className={`text-sm font-bold tracking-widest ${theme.appTitle}`}>
          {gamify ? '⚔️ MOMENTUM QUEST ⚔️' : 'MOMENTUM DAILY'}
        </span>
        <div className="w-16 flex justify-end">
          {authUser && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold">SYNCED</span>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-4"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {tab === 'habits'    && <HabitsScreen        theme={theme} gamify={gamify} onNavigate={setTab} />}
        {tab === 'tasks'     && <TasksScreen          theme={theme} gamify={gamify} />}
        {tab === 'tracker'   && <CalendarStatsScreen  theme={theme} gamify={gamify} onShowScoringHelp={() => { setSettingsFocus('scoring'); setTab('settings'); }} />}
        {tab === 'wellbeing' && <WellbeingScreen      theme={theme} gamify={gamify} />}
        {tab === 'settings'  && (
          <SettingsScreen
            theme={theme}
            authUser={authUser}
            syncing={syncing}
            onShowAuth={() => setShowAuth(true)}
            onSignOut={handleSignOut}
            onPushToCloud={handlePushToCloud}
            onPullFromCloud={handlePullFromCloud}
            onDeleteAccount={handleDeleteAccount}
            focus={settingsFocus}
            onFocusHandled={() => setSettingsFocus(null)}
          />
        )}
      </div>

      {/* Sticky bottom nav */}
      <div className={`flex-shrink-0 border-t px-1 pt-2 ${theme.nav}`} style={{ paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))' }}>
        <div className="flex">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center py-1.5 rounded-xl transition-all ${tab === t.id ? theme.tabActiveBg : ''}`}
            >
              <span className="w-6 h-6 flex items-center justify-center text-lg leading-none">{t.icon}</span>
              <span className={`text-[10px] mt-0.5 font-medium leading-none text-center whitespace-nowrap ${tab === t.id ? theme.tabActiveText : theme.tabInactive}`}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
      </div>

    </div>

    {/* Auth overlay */}
    {showAuth && (
      <AuthScreen
        theme={theme}
        onClose={() => setShowAuth(false)}
        onSuccess={() => setShowAuth(false)}
      />
    )}

    {/* Sync conflict modal */}
    {syncConflict && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }}>
        <div className={`w-full max-w-sm rounded-2xl p-6 shadow-xl ${theme.card}`}>
          <p className={`text-base font-bold mb-1 ${theme.text}`}>Data found on both devices</p>
          <p className={`text-sm mb-5 ${theme.muted}`}>
            Your cloud and this device both have data. Which would you like to keep?
          </p>
          <div className="flex flex-col gap-3">
            <button
              className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-500 text-white"
              onClick={async () => {
                hydrateFromSupabase(syncConflict.remoteData);
                setSyncConflict(null);
                setSyncMsg('✓ Using cloud data');
                setTimeout(() => setSyncMsg(''), 4000);
              }}
            >
              Use cloud data
            </button>
            <button
              className="w-full py-3 rounded-xl text-sm font-semibold bg-amber-500 text-white"
              onClick={async () => {
                setSyncConflict(null);
                setSyncing(true);
                try {
                  await pushAllData(syncConflict.userId, useStore.getState());
                  setSyncMsg('✓ Local data backed up to cloud');
                } catch (err) {
                  captureError(err, { context: 'conflictPush' });
                  setSyncMsg('Push failed — check connection');
                } finally {
                  setSyncing(false);
                  setTimeout(() => setSyncMsg(''), 4000);
                }
              }}
            >
              Keep this device's data
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Reset password modal — shown after user clicks email link */}
    {showResetPassword && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.6)' }}>
        <div className={`w-full max-w-sm rounded-2xl p-6 shadow-xl ${theme.card}`}>
          <p className={`text-base font-bold mb-1 ${theme.text}`}>Set new password</p>
          {resetSuccess ? (
            <>
              <p className={`text-sm mb-5 ${theme.muted}`}>Password updated! You're signed in.</p>
              <button
                className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-500 text-white"
                onClick={() => { setShowResetPassword(false); setResetSuccess(false); setResetNewPassword(''); }}
              >Done</button>
            </>
          ) : (
            <>
              <p className={`text-sm mb-4 ${theme.muted}`}>Enter a new password for your account.</p>
              <div className="relative mb-3">
                <input
                  type={resetShowPassword ? 'text' : 'password'}
                  value={resetNewPassword}
                  onChange={e => setResetNewPassword(e.target.value)}
                  placeholder="New password (6+ characters)"
                  className={`w-full pl-3 pr-10 py-2.5 rounded-xl border text-sm outline-none ${theme.input}`}
                />
                <button
                  type="button"
                  onClick={() => setResetShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-sm opacity-50 hover:opacity-100"
                >{resetShowPassword ? '🙈' : '👁️'}</button>
              </div>
              {resetError && <p className="text-xs text-red-500 mb-3">{resetError}</p>}
              <button
                disabled={resetLoading || resetNewPassword.length < 6}
                className="w-full py-3 rounded-xl text-sm font-semibold bg-blue-500 text-white disabled:opacity-50"
                onClick={async () => {
                  setResetLoading(true);
                  setResetError('');
                  try {
                    await updatePassword(resetNewPassword);
                    setResetSuccess(true);
                  } catch (err) {
                    setResetError(err.message || 'Something went wrong — try again.');
                  } finally {
                    setResetLoading(false);
                  }
                }}
              >{resetLoading ? 'Updating…' : 'Update password'}</button>
            </>
          )}
        </div>
      </div>
    )}

    </AppErrorBoundary>
  );
}
