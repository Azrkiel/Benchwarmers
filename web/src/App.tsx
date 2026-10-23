import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { DevicePage } from './device/DevicePage';
import { VoiceLabPage } from './voiceid/VoiceLabPage';
import { useScorebookTheme } from './lib/theme';
import { HomePage } from './home/HomePage';
import { WelcomePage } from './home/WelcomePage';
import { NotFound, PageTitle, RouteBoundary, RouteLoading } from './shell/RouteStatus';

// TV layouts keep their CSS in independent route chunks.
const TvPage = lazy(() => import('./tv/TvPage').then((m) => ({ default: m.TvPage })));
const BroadcastTvPage = lazy(() => import('./tv-broadcast/TvPage').then((m) => ({ default: m.TvPage })));
const LoungePage = lazy(() => import('./lounge/LoungePage').then((m) => ({ default: m.LoungePage })));
const WatchPage = lazy(() => import('./watch/WatchPage').then((m) => ({ default: m.WatchPage })));
const ControlPage = lazy(() => import('./control/ControlPage').then((m) => ({ default: m.ControlPage })));
const RoomPage = lazy(() => import('./room/RoomPage').then((m) => ({ default: m.RoomPage })));
const RoomTvPage = lazy(() => import('./room/RoomTvPage').then((m) => ({ default: m.RoomTvPage })));

function Scorebook({ children }: { children: ReactNode }) {
  useScorebookTheme();
  return <>{children}</>;
}

export function App() {
  return <BrowserRouter><PageTitle /><RouteBoundary>
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="/room/:code/tv" element={<RoomTvPage />} />
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/tv/:code" element={<TvPage />} />
        <Route path="/tv2/:code" element={<Scorebook><BroadcastTvPage /></Scorebook>} />
        <Route path="/lounge/:code" element={<Scorebook><LoungePage /></Scorebook>} />
        <Route path="/watch/:code" element={<Scorebook><WatchPage /></Scorebook>} />
        <Route path="/control/:code" element={<Scorebook><ControlPage /></Scorebook>} />
        <Route path="/device/:household" element={<DevicePage />} />
        <Route path="/voice-lab" element={<VoiceLabPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </RouteBoundary></BrowserRouter>;
}
