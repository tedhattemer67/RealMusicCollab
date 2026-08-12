import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import Home from './pages/Home.jsx';
import RedeemInvite from './pages/RedeemInvite.jsx';
import { getMe } from './api';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkedSession, setCheckedSession] = useState(false);

  // On first load, ask the server who (if anyone) the current session
  // cookie belongs to — this is what lets a page refresh stay logged in
  // instead of bouncing back to the login screen every time.
  useEffect(() => {
    getMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setCheckedSession(true));
  }, []);

  if (!checkedSession) {
    return <p style={{ textAlign: 'center', marginTop: 80, fontFamily: 'sans-serif' }}>Loading…</p>;
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login onLoggedIn={setUser} />} />
      <Route path="/invite/:token" element={<RedeemInvite onRedeemed={setUser} />} />
      <Route
        path="/*"
        element={user ? <Home user={user} onLoggedOut={() => setUser(null)} /> : <Navigate to="/login" />}
      />
    </Routes>
  );
}
