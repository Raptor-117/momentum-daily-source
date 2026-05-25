import { useState, useEffect } from 'react';
import { useStore }        from './store';
import { getTheme }        from './data/theme';
import HabitsScreen        from './screens/HabitsScreen';
import TasksScreen         from './screens/TasksScreen';
import CalendarStatsScreen from './screens/CalendarStatsScreen';
import WellbeingScreen     from './screens/WellbeingScreen';
import SettingsScreen      from './screens/SettingsScreen';

export default function App() {
  const [tab, setTab] = useState('habits');
  const darkMode = useStore(s => s.darkMode);
  const gamify   = useStore(s => s.gamify);
  const theme    = getTheme(darkMode);

  const notifications = useStore(s => s.notifications);

  // Schedule browser notifications for today
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

  const TABS = [
    { id: 'habits',    icon: gamify ? '⚔️' : '☀️', label: gamify ? 'Quests'    : 'Habits'    },
    { id: 'tasks',     icon: gamify ? '📜' : '✅', label: gamify ? 'Contracts' : 'Tasks'     },
    { id: 'tracker',   icon: '📅',                  label: 'Tracker'                          },
    { id: 'wellbeing', icon: gamify ? '🏕️' : '🏛️',  label: gamify ? 'Tavern' : 'Sanctum'     },
    { id: 'settings',  icon: '⚙️',                  label: 'Settings'                         },
  ];

  return (
    <div className={`h-[100dvh] flex flex-col ${theme.bg}`}>

      {/* Top header */}
      <div className={`flex-shrink-0 px-4 py-3 border-b flex items-center justify-center ${theme.header}`}>
        <span className={`text-sm font-bold tracking-widest ${theme.appTitle}`}>
          {gamify ? '⚔️ MOMENTUM QUEST ⚔️' : 'MOMENTUM DAILY'}
        </span>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 pt-3 pb-4">
        {tab === 'habits'    && <HabitsScreen        theme={theme} gamify={gamify} />}
        {tab === 'tasks'     && <TasksScreen          theme={theme} gamify={gamify} />}
        {tab === 'tracker'   && <CalendarStatsScreen  theme={theme} gamify={gamify} />}
        {tab === 'wellbeing' && <WellbeingScreen      theme={theme} gamify={gamify} />}
        {tab === 'settings'  && <SettingsScreen       theme={theme} />}
      </div>

      {/* Sticky bottom nav */}
      <div className={`flex-shrink-0 border-t px-1 py-2 ${theme.nav}`}>
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
  );
}
