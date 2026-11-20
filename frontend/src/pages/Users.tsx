import React, { useState, useEffect } from 'react';
import { authService, type AuthUser } from '../services/auth';
import {
  UserPlus,
  Shield,
  Mail,
  Lock,
  User as UserIcon,
  CheckCircle,
  AlertCircle,
  Users as UsersIcon,
  RefreshCw,
} from 'lucide-react';

interface UsersPageProps {
  currentUser?: AuthUser | null;
}

export const UsersPage: React.FC<UsersPageProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'analyst' | 'viewer'>('viewer');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const list = await authService.adminGetUsers();
      setUsers(list);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setErrorMsg('Please provide a valid email address.');
      return;
    }
    if (password.length < 12) {
      setErrorMsg('Admin-provisioned user passwords must be at least 12 characters.');
      return;
    }

    setCreating(true);
    try {
      const created = await authService.adminCreateUser({
        name: trimmedName || undefined,
        email: trimmedEmail,
        password,
        role,
      });
      setSuccessMsg(`Successfully provisioned account for ${created.email} (${created.role}).`);
      setName('');
      setEmail('');
      setPassword('');
      setRole('viewer');
      fetchUsers();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to provision user.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <UsersIcon className="text-cyan-400" size={22} />
            User Access Management
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Provision team members, assign role-based permissions, and manage active platform accounts.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/60 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Provision Form (1 column) */}
        <div className="lg:col-span-1 dark-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-sm border-b border-slate-800 pb-3">
            <UserPlus size={16} />
            <span>Provision New User</span>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-rose-400 text-xs bg-rose-500/10 border border-rose-500/20">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-start gap-2 p-3 rounded-lg text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle size={14} className="shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-slate-300 text-xs font-medium">Full Name (optional)</label>
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 focus-within:border-cyan-500 text-xs">
                <UserIcon size={14} className="text-slate-500 shrink-0" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dana Scully"
                  className="bg-transparent border-none outline-none w-full text-white placeholder-slate-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 text-xs font-medium">Email address</label>
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 focus-within:border-cyan-500 text-xs">
                <Mail size={14} className="text-slate-500 shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@organization.com"
                  required
                  className="bg-transparent border-none outline-none w-full text-white placeholder-slate-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 text-xs font-medium">Password (min 12 chars)</label>
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 focus-within:border-cyan-500 text-xs">
                <Lock size={14} className="text-slate-500 shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 12 characters"
                  required
                  minLength={12}
                  className="bg-transparent border-none outline-none w-full text-white placeholder-slate-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 text-xs font-medium">Access Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'admin' | 'analyst' | 'viewer')}
                className="w-full px-3 py-2 rounded-lg bg-slate-950/70 border border-slate-800 text-white text-xs outline-none focus:border-cyan-500"
              >
                <option value="viewer">Viewer (Read-only)</option>
                <option value="analyst">Analyst (Triage, Detect, Reports)</option>
                <option value="admin">Administrator (Full Control)</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creating}
              className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 rounded-lg text-white font-semibold text-xs transition-all bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 shadow-md shadow-blue-500/20 disabled:opacity-50"
            >
              {creating ? 'Provisioning...' : 'Provision User'}
            </button>
          </form>
        </div>

        {/* User Directory (2 columns) */}
        <div className="lg:col-span-2 dark-panel p-6 rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-md space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2 text-white font-semibold text-sm">
              <Shield size={16} className="text-cyan-400" />
              <span>Registered Users ({users.length})</span>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">Backend RBAC Enforced</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono text-[11px]">
                  <th className="py-2.5 px-3">User</th>
                  <th className="py-2.5 px-3">Email</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((u) => {
                  const roleBadge =
                    u.role === 'admin'
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      : u.role === 'analyst'
                      ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                      : 'bg-slate-500/10 text-slate-400 border-slate-500/20';

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium text-white">
                        {u.name || (u.email.split('@')[0])}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 font-mono text-[11px]">{u.email}</td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono capitalize ${roleBadge}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 text-[11px]">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="text-center py-6 text-slate-500">
                      {loading ? 'Loading user directory...' : 'No users loaded.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

