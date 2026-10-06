/**
 * App — root component with hash-based routing.
 * URL fragment: /#/<endpointId> → Dashboard
 * Root (/) → Landing
 *
 * Endpoint ID and manage token are persisted in localStorage
 * (token key: hookscope-token-<id>) and URL hash.
 */
import { useEffect, useState } from 'react';
import { ThemeProvider } from './components/ThemeProvider';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';

interface ActiveEndpoint {
  id: string;
  token: string;
  hookUrl: string;
  expiresAt: string;
}

function getHookUrl(id: string): string {
  const base = import.meta.env.VITE_PUBLIC_BASE_URL ?? window.location.origin;
  return `${base}/hook/${id}`;
}

function AppInner() {
  const [active, setActive] = useState<ActiveEndpoint | null>(null);

  // On mount: read hash to restore previous session
  useEffect(() => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash) {
      const id = hash;
      const token = localStorage.getItem(`hookscope-token-${id}`);
      if (token) {
        setActive({
          id,
          token,
          hookUrl: getHookUrl(id),
          expiresAt: localStorage.getItem(`hookscope-expires-${id}`) ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        });
      } else {
        // token gone — clear hash and go to landing
        window.location.hash = '';
      }
    }
  }, []);

  const handleEndpointCreated = (
    id: string,
    token: string,
    hookUrl: string,
    expiresAt: string,
  ) => {
    localStorage.setItem(`hookscope-token-${id}`, token);
    localStorage.setItem(`hookscope-expires-${id}`, expiresAt);
    window.location.hash = `/${id}`;
    setActive({ id, token, hookUrl, expiresAt });
  };

  const handleBack = () => {
    window.location.hash = '';
    setActive(null);
  };

  if (active) {
    return (
      <Dashboard
        endpointId={active.id}
        manageToken={active.token}
        hookUrl={active.hookUrl}
        expiresAt={active.expiresAt}
        onBack={handleBack}
      />
    );
  }

  return <Landing onEndpointCreated={handleEndpointCreated} />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}
