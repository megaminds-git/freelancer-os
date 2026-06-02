import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ThemeToggle from './ThemeToggle';
import VoiceAssistantProvider from '../../context/VoiceAssistantContext';
import VoiceOrb from '../VoiceOrb';
import { useVoiceAssistantStore } from '../../store/voiceAssistantStore';

function RouteTracker() {
  const location = useLocation();
  const updateSessionContext = useVoiceAssistantStore((s) => s.updateSessionContext);

  useEffect(() => {
    updateSessionContext({ lastRoute: location.pathname });
  }, [location.pathname, updateSessionContext]);

  return null;
}

export default function Layout() {
  return (
    <VoiceAssistantProvider>
      <RouteTracker />
      <div className="flex h-screen min-h-0 overflow-hidden">
        <Sidebar />
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden flex flex-col">
          <div className="app-layout-toolbar shrink-0">
            <div className="flex justify-end px-4 pt-3 pb-1 sm:px-6 sm:pt-4 xl:px-8 2xl:px-10">
              <ThemeToggle />
            </div>
          </div>
          <main className="app-main-surface min-h-0 min-w-0 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
      <VoiceOrb />
    </VoiceAssistantProvider>
  );
}
