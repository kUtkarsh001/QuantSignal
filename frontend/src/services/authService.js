/**
 * authService.js — Auth API wrappers
 * Architecture §2.3 (API communication pattern)
 *
 * All functions throw on API error with a user-readable message.
 * The caller (LoginPage, AuthContext) handles the error UI.
 */

const API = import.meta.env.VITE_API_URL;

async function request(method, endpoint, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res  = await fetch(`${API}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!data.success) {
    throw new Error(data.error?.message || 'An unexpected error occurred.');
  }

  return data;
}

export const authService = {
  /**
   * register — POST /api/auth/register
   * @returns { success, token, user: { id, email, displayName } }
   */
  register: (email, password, displayName) =>
    request('POST', '/api/auth/register', { email, password, displayName }),

  /**
   * login — POST /api/auth/login
   * @returns { success, token, user: { id, email, displayName } }
   */
  login: (email, password) =>
    request('POST', '/api/auth/login', { email, password }),

  /**
   * getProfile — GET /api/user/profile
   * @returns { success, user: { id, email, displayName, createdAt } }
   */
  getProfile: (token) =>
    request('GET', '/api/user/profile', null, token),
};
