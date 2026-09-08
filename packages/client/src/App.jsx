import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import RedeemInvite from './pages/RedeemInvite.jsx';
import Bootstrap from './pages/Bootstrap.jsx';
import { getMe, checkBootstrapAvailable } from './api';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkedSession, setCheckedSession] = useState(false);
  // True only on a brand-new instance with zero accounts — sends a logged-out
  // visitor to /setup instead of a /login screen they could never get past.
  const [needsSetup, setNeedsSetup] = useState(false);

  // On first load, ask the server who (if anyone) the current session
  // cookie belongs to — this is what lets a page refresh stay logged in
  // instead of bouncing back to the login screen every time.
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(async () => {
        setUser(null);
        try {
          const { available } = await checkBootstrapAvailable();
          setNeedsSetup(Boolean(available));
        } catch {
          /* leave needsSetup false — fall back to the login screen */
        }
      })
      .finally(() => setCheckedSession(true));
  }, []);

  if (!checkedSession) {
    return <p style={{ textAlign: 'center', marginTop: 80, fontFamily: 'sans-serif' }}>Loading…</p>;
  }

  const loggedOutLanding = needsSetup ? '/setup' : '/login';

  return (
    <Routes>
      <Route
        path="/login"
        element={
          user ? <Navigate to="/" /> : needsSetup ? <Navigate to="/setup" /> : <Login onLoggedIn={setUser} />
        }
      />
      <Route path="/invite/:token" element={<RedeemInvite onRedeemed={setUser} />} />
      <Route path="/setup" element={<Bootstrap onLoggedIn={setUser} />} />
      <Route
        path="/*"
        element={
          user ? <Home user={user} onLoggedOut={() => setUser(null)} /> : <Navigate to={loggedOutLanding} />
        }
      />
    </Routes>
  );
}
