import { Navigate, Route, Routes } from 'react-router-dom';
import { GetApp } from './GetApp';
import { Login } from './Login';
import { getSession } from './api';
import { DispatcherApp } from './roles/dispatcher/DispatcherApp';
import { DriverApp } from './roles/driver/DriverApp';
import { LoaderApp } from './roles/loader/LoaderApp';
import { StoreApp } from './roles/store/StoreApp';

// Each role area lives in src/roles/<role>/ and is owned by one team member (see README).

function Guard({ role, children }: { role: string; children: JSX.Element }) {
  const s = getSession();
  if (!s) return <Navigate to="/login" replace />;
  if (s.user.role !== role) return <Navigate to={`/${s.user.role}`} replace />;
  return children;
}

/** "/" and unknown paths: the signed-in user's home, or the sign-in page. */
function Home() {
  const s = getSession();
  return <Navigate to={s ? `/${s.user.role}` : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/get-app" element={<GetApp />} />
      <Route path="/dispatcher/*" element={<Guard role="dispatcher"><DispatcherApp /></Guard>} />
      <Route path="/loader/*" element={<Guard role="loader"><LoaderApp /></Guard>} />
      <Route path="/driver/*" element={<Guard role="driver"><DriverApp /></Guard>} />
      <Route path="/store/*" element={<Guard role="store"><StoreApp /></Guard>} />
      <Route path="*" element={<Home />} />
    </Routes>
  );
}
