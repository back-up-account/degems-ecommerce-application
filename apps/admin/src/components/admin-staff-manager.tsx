'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { STAFF_ROLES, getStaffRoleDescription, getStaffRoleLabel } from '@api/lib/admin-permissions';

type StaffAccount = {
  id: string;
  email: string;
  name: string | null;
  role: 'CUSTOMER' | (typeof STAFF_ROLES)[number];
  emailVerified: boolean;
  passwordBased: boolean;
  disabledAt: string | null;
  mfaEnabledAt: string | null;
  staffSetupRequired: boolean;
  staffSetupExpiresAt: string | null;
};

type MfaEnrollment = {
  uri: string;
  recoveryCodes: string[];
};

export function AdminStaffManager() {
  const [accounts, setAccounts] = useState<StaffAccount[]>([]);
  const [selection, setSelection] = useState<Record<string, StaffAccount['role']>>({});
  const [enrollment, setEnrollment] = useState<{ email: string; details: MfaEnrollment } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAccount, setBusyAccount] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState('');

  async function loadAccounts() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/staff', { cache: 'no-store' });
      const result = await response.json() as { message?: string; users?: StaffAccount[] };
      if (!response.ok || !result.users) {
        setMessage(result.message ?? 'Staff accounts could not be loaded.');
        return;
      }
      setAccounts(result.users);
      setSelection(Object.fromEntries(result.users.map((user) => [user.id, user.role])));
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    async function fetchAccounts() {
      try {
        const response = await fetch('/api/admin/staff', { cache: 'no-store' });
        const result = await response.json() as { message?: string; users?: StaffAccount[] };
        if (!active) return;
        if (!response.ok || !result.users) {
          setMessage(result.message ?? 'Staff accounts could not be loaded.');
          return;
        }
        setAccounts(result.users);
        setSelection(Object.fromEntries(result.users.map((user) => [user.id, user.role])));
      } catch {
        if (active) setMessage('Could not reach the server. Try again shortly.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchAccounts();
    return () => {
      active = false;
    };
  }, []);

  async function updateRole(account: StaffAccount, resetMfa = false) {
    const role = selection[account.id] ?? account.role;
    if (role === account.role && !resetMfa) return;

    setBusyAccount(account.id);
    setMessage('');
    setEnrollment(null);
    try {
      const response = await fetch('/api/admin/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.id, role, resetMfa }),
      });
      const result = await response.json() as {
        message?: string;
        mfaEnrollment?: MfaEnrollment;
        mfaReset?: boolean;
      };
      if (!response.ok) {
        setMessage(result.message ?? 'Staff access could not be updated.');
        return;
      }
      if (result.mfaEnrollment) {
        setEnrollment({ email: account.email, details: result.mfaEnrollment });
        setMessage(result.mfaReset
          ? 'MFA reset. Securely give the new one-time setup URI and recovery codes to this staff member now.'
          : 'Role assigned. Securely give the one-time setup URI and recovery codes to this staff member now.');
      } else {
        setMessage(`${account.email} access updated. Their existing sessions have been revoked.`);
      }
      await loadAccounts();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyAccount(null);
    }
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setMessage('');
    const form = event.currentTarget;
    const formData = new FormData(form);

    try {
      const response = await fetch('/api/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(formData.get('name') ?? ''),
          email: String(formData.get('email') ?? ''),
          role: String(formData.get('role') ?? ''),
        }),
      });
      const result = await response.json() as { message?: string };
      setMessage(result.message ?? (response.ok
        ? 'Staff invitation queued.'
        : 'Staff account could not be created.'));
      if (response.ok) {
        form.reset();
        await loadAccounts();
      }
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setCreating(false);
    }
  }

  async function resendInvitation(account: StaffAccount) {
    if (!window.confirm(`Send a new temporary password and setup invitation to ${account.email}?`)) return;

    setBusyAccount(account.id);
    setMessage('');
    try {
      const response = await fetch('/api/admin/staff/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.id }),
      });
      const result = await response.json() as { message?: string };
      setMessage(result.message ?? (response.ok
        ? `A new invitation was queued for ${account.email}.`
        : 'Staff invitation could not be resent.'));
      if (response.ok) await loadAccounts();
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyAccount(null);
    }
  }

  async function forcePasswordReset(account: StaffAccount) {
    if (!window.confirm(`Require ${account.email} to change their password? Their active sessions will be revoked and a one-time reset link will be emailed.`)) {
      return;
    }

    setBusyAccount(account.id);
    setMessage('');
    setEnrollment(null);
    try {
      const response = await fetch('/api/admin/staff/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: account.id }),
      });
      const result = await response.json() as { message?: string };
      setMessage(result.message ?? (response.ok
        ? 'Password reset link queued and existing sessions invalidated.'
        : 'Password reset could not be requested.'));
    } catch {
      setMessage('Could not reach the server. Try again shortly.');
    } finally {
      setBusyAccount(null);
    }
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="mb-2 text-xs uppercase tracking-[0.24em] text-stone-500">Access control</p>
        <h2 className="text-2xl font-semibold text-stone-900">Staff roles</h2>
        <p className="mt-2 text-sm leading-6 text-stone-600">
          Add staff by email, assign only the access needed for each job, and audit role changes.
          New staff receive a temporary password and must change it and enroll MFA before accessing admin tools.
        </p>
      </div>

      <form onSubmit={createStaff} className="mb-7 grid gap-4 rounded-2xl border border-stone-200 bg-stone-50 p-5 sm:grid-cols-2">
        <h3 className="text-lg font-semibold text-stone-900 sm:col-span-2">Add staff member</h3>
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Name</span>
          <input name="name" type="text" autoComplete="name" minLength={2} maxLength={100} required className={inputClass} />
        </label>
        <label className="space-y-2 text-sm font-medium text-stone-700">
          <span>Work email</span>
          <input name="email" type="email" autoComplete="email" maxLength={254} required className={inputClass} />
        </label>
        <label className="space-y-2 text-sm font-medium text-stone-700 sm:col-span-2">
          <span>Staff role</span>
          <select name="role" required defaultValue="CATALOG_STAFF" className={inputClass}>
            {STAFF_ROLES.map((role) => (
              <option key={role} value={role}>{getStaffRoleLabel(role)}</option>
            ))}
          </select>
        </label>
        <p className="text-xs leading-5 text-stone-600 sm:col-span-2">
          A unique temporary password will be emailed. The invitation expires after 24 hours; first-time setup requires a new password and authenticator enrollment.
        </p>
        <button
          type="submit"
          disabled={creating}
          className="w-fit rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-60"
        >
          {creating ? 'Creating…' : 'Create staff account'}
        </button>
      </form>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STAFF_ROLES.map((role) => (
          <article key={role} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
            <h3 className="text-sm font-semibold text-stone-900">{getStaffRoleLabel(role)}</h3>
            <p className="mt-2 text-xs leading-5 text-stone-600">{getStaffRoleDescription(role)}</p>
          </article>
        ))}
      </div>
      <p className="mb-5 text-xs leading-5 text-stone-500">
        Owner / administrator access is reserved and cannot be assigned from this staff list.
      </p>

      {loading ? <p role="status" className="text-sm text-stone-600">Loading accounts…</p> : null}
      {!loading && accounts.length === 0 ? (
        <p className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">No eligible customer or staff accounts found.</p>
      ) : null}
      {accounts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <caption className="sr-only">Customer and staff access assignments</caption>
            <thead className="border-b border-stone-200 text-stone-500">
              <tr>
                <th scope="col" className="pb-3 pr-4 font-medium">Account</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Current access</th>
                <th scope="col" className="pb-3 pr-4 font-medium">MFA</th>
                <th scope="col" className="pb-3 pr-4 font-medium">Assign role</th>
                <th scope="col" className="pb-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b border-stone-100 last:border-b-0">
                  <td className="py-4 pr-4">
                    <p className="font-medium text-stone-900">{account.name ?? 'No name provided'}</p>
                    <p className="text-stone-600">{account.email}</p>
                    {account.staffSetupRequired ? (
                      <p className="mt-1 text-xs text-amber-700">
                        First-login setup pending
                        {account.staffSetupExpiresAt
                          ? ` · expires ${new Date(account.staffSetupExpiresAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })}`
                          : ''}
                      </p>
                    ) : !account.emailVerified ? <p className="mt-1 text-xs text-amber-700">Email not verified</p> : null}
                    {account.disabledAt ? <p className="mt-1 text-xs text-red-700">Account disabled</p> : null}
                  </td>
                  <td className="py-4 pr-4 text-stone-600">{getStaffRoleLabel(account.role)}</td>
                  <td className="py-4 pr-4 text-stone-600">
                    {account.staffSetupRequired ? 'Required during first login' : account.mfaEnabledAt ? 'Enabled' : 'Not enabled'}
                  </td>
                  <td className="py-4 pr-4">
                    <select
                      value={selection[account.id] ?? account.role}
                      disabled={
                        busyAccount === account.id
                        || (Boolean(account.disabledAt) && account.role === 'CUSTOMER')
                        || (!account.staffSetupRequired && (!account.emailVerified || !account.passwordBased))
                      }
                      onChange={(event) => setSelection((current) => ({
                        ...current,
                        [account.id]: event.currentTarget.value as StaffAccount['role'],
                      }))}
                      aria-label={`Role for ${account.email}`}
                      className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="CUSTOMER">Customer (no admin access)</option>
                      {STAFF_ROLES.map((role) => (
                        <option key={role} value={role}>{getStaffRoleLabel(role)}</option>
                      ))}
                    </select>
                    {!account.passwordBased && !account.staffSetupRequired ? (
                      <p className="mt-1 text-xs text-amber-700">A password-based account is required for staff access.</p>
                    ) : null}
                  </td>
                  <td className="py-4 text-right">
                    <button
                      type="button"
                      disabled={busyAccount === account.id || (selection[account.id] ?? account.role) === account.role}
                      onClick={() => void updateRole(account)}
                      className="rounded-full border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                      {busyAccount === account.id ? 'Saving…' : 'Save role'}
                    </button>
                    {account.staffSetupRequired ? (
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          disabled={busyAccount === account.id || Boolean(account.disabledAt)}
                          onClick={() => void resendInvitation(account)}
                          className="rounded-full border border-amber-300 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                        >
                          Resend invitation
                        </button>
                      </div>
                    ) : account.role !== 'CUSTOMER' ? (
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyAccount === account.id || Boolean(account.disabledAt) || !account.emailVerified || !account.passwordBased}
                          onClick={() => void forcePasswordReset(account)}
                          className="rounded-full border border-amber-300 px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                        >
                          Require password reset
                        </button>
                        <button
                          type="button"
                          disabled={busyAccount === account.id}
                          onClick={() => void updateRole(account, true)}
                          className="rounded-full border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                        >
                          Reset MFA
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {enrollment ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h3 className="font-semibold text-amber-950">One-time MFA setup for {enrollment.email}</h3>
          <p className="text-sm leading-6 text-amber-900">
            This setup URI and these recovery codes will not be shown again. Deliver them privately to the staff member,
            have them store the codes securely, and do not send them in a shared chat or ticket.
          </p>
          <code className="block overflow-x-auto rounded-xl bg-white p-3 text-xs text-stone-800">{enrollment.details.uri}</code>
          <ul className="grid gap-2 sm:grid-cols-2">
            {enrollment.details.recoveryCodes.map((code) => (
              <li key={code} className="rounded-lg bg-white px-3 py-2 font-mono text-sm">{code}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setEnrollment(null)}
            className="rounded-full border border-amber-400 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
          >
            I have securely transferred the setup details
          </button>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="mt-4 text-sm text-stone-600">{message}</p>
    </section>
  );
}

const inputClass = 'w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-stone-900';
