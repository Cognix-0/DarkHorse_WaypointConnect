import { Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './Login';
import { getSession } from './api';
import { DispatcherApp } from './roles/dispatcher/DispatcherApp';

// Each role area lives in src/roles/<role>/ and is owned by one team member (see README).
const Placeholder = ({ role }: { role: string }) => (
  <main className="p-8">
    <h1 className="text-2xl font-bold capitalize">{role}</h1>
    <p className="text-ink-2">Screens for this role are built in Parts 3 and 4 of the plan.</p>
  </main>
);

function Guard({ role, children }: { role: string; children: JSX.Element }) {
  const s = getSession();
  if (!s) return <Navigate to="/login" replace />;
  if (s.user.role !== role) return <Navigate to={`/${s.user.role}`} replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dispatcher/*" element={<Guard role="dispatcher"><DispatcherApp /></Guard>} />
      {(['loader', 'driver', 'store'] as const).map((r) => (
        <Route key={r} path={`/${r}/*`} element={<Guard role={r}><Placeholder role={r} /></Guard>} />
      ))}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
