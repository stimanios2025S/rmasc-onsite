export interface Utilisateur {
  id: string;
  identifiant: string;
  email: string;
  prenom: string;
  nom: string;
  role: 'technicien' | 'ingenieur' | 'dispatcher' | 'administrateur';
  equipeId?: string;
  telephone?: string;
  nomEquipe?: string;
  typeEquipe?: string;
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('rmasc_token');
}

export function getUtilisateur(): Utilisateur | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('rmasc_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function estConnecte(): boolean {
  return !!getToken();
}

export function deconnecter(): void {
  localStorage.removeItem('rmasc_token');
  localStorage.removeItem('rmasc_user');
  window.location.href = '/login';
}

export function apiUrl(path: string): string {
  return `/api${path}`;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path), { ...options, headers });
  } catch (networkErr: any) {
    // Network error (DNS failure, timeout, CORS, offline)
    throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion.');
  }

  if (res.status === 401) {
    // Token expire -> rediriger vers login
    if (typeof window !== 'undefined') {
      deconnecter();
    }
    throw new Error('Non authentifié');
  }

  // Parse response safely — server might return HTML (Cloudflare error page, etc.)
  let data: any;
  try {
    data = await res.json();
  } catch {
    // Non-JSON response (HTML error page, empty body, etc.)
    if (!res.ok) {
      throw new Error(`Erreur serveur (HTTP ${res.status}). Reessayez plus tard.`);
    }
    // 200 but not JSON — rare, return empty
    return {} as T;
  }

  if (!res.ok) {
    throw new Error(data.erreur || `Erreur serveur (HTTP ${res.status}).`);
  }
  return data;
}
