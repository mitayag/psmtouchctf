import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AdminScreen } from './screens/AdminScreen';
import { ChallengeScreen } from './screens/ChallengeScreen';
import { ClaimResultScreen } from './screens/ClaimResultScreen';
import { DevChallengeGalleryScreen } from './screens/DevChallengeGalleryScreen';
import { DevScenarioScreen } from './screens/DevScenarioScreen';
import { FlagCaptureScreen } from './screens/FlagCaptureScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { PrizeWheelScreen } from './screens/PrizeWheelScreen';
import { RegisterScreen } from './screens/RegisterScreen';
import { ResultsScreen } from './screens/ResultsScreen';
import { ReadyScreen } from './screens/ReadyScreen';
import { StaffScreen } from './screens/StaffScreen';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

import { useEffect } from 'react';

function ChallengeScreenKeyed() {
  const { sessionId } = useParams<{ sessionId: string }>();
  return <ChallengeScreen key={sessionId} />;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/play/setup" element={<RegisterScreen />} />
        <Route path="/play/:sessionId/ready" element={<ReadyScreen />} />
        <Route path="/play/:sessionId/challenge/:position" element={<ChallengeScreenKeyed />} />
        <Route path="/play/:sessionId/flag" element={<FlagCaptureScreen />} />
        <Route path="/play/:sessionId/results" element={<ResultsScreen />} />
        <Route path="/play/:sessionId/prize" element={<PrizeWheelScreen />} />
        <Route path="/play/:sessionId/claim" element={<ClaimResultScreen />} />
        <Route path="/leaderboard" element={<LeaderboardScreen />} />
        <Route path="/admin" element={<AdminScreen />} />
        <Route path="/staff" element={<StaffScreen />} />
        <Route path="/dev-scenarios" element={<DevScenarioScreen />} />
        <Route path="/dev-challenges" element={<DevChallengeGalleryScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
