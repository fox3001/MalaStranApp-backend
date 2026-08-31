import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Route as RootRoute } from './__root';
import { createRoute } from '@tanstack/react-router';
import { api } from '../lib/api';

export const Route = createRoute({
  getParentRoute: () => RootRoute,
  path: '/',
  component: LoginPage,
});

export default function LoginPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          isAdmin
            ? { adminOnly: true, password }
            : { nome, cognome, password },
        ),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login fallito');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      navigate({
        to: isAdmin ? '/admin' : '/u',
      });
    } catch (err) {
      setError('Errore di connessione al server');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div>
          <h2 className="text-2xl font-bold text-center">Malastrana Eventi</h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Accedi come {isAdmin ? 'Admin' : 'Collaboratore'}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2">
          <label className="text-sm">Sei Admin?</label>
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="h-4 w-4"
          />
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {!isAdmin && (
            <>
              <div>
                <label htmlFor="nome" className="block text-sm font-medium text-gray-700">
                  Nome
                </label>
                <input
                  id="nome"
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="cognome" className="block text-sm font-medium text-gray-700">
                  Cognome
                </label>
                <input
                  id="cognome"
                  type="text"
                  required
                  value={cognome}
                  onChange={(e) => setCognome(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <button
            type="submit"
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Accedi
          </button>
        </form>
      </div>
    </div>
  );
}
