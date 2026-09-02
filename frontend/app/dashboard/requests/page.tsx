"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";

type PendingUser = {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type ApiResponse = {
  status: string;
  data?: PendingUser[];
  message?: string;
};

export default function RequestsPage() {
  const [users, setUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchPendingUsers = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/proxy/admin/users/pending");
      const body: ApiResponse = await response.json();

      if (!response.ok || body.status !== "success") {
        throw new Error(body.message || "Failed to fetch pending users");
      }

      setUsers(body.data ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while loading requests.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    setError("");

    try {
      const response = await fetch(`/api/proxy/admin/users/${userId}/approve`, {
        method: "PATCH",
      });

      const body: ApiResponse = await response.json();

      if (!response.ok || body.status !== "success") {
        throw new Error(body.message || "Failed to approve user");
      }

      setUsers((currentUsers) =>
        currentUsers.filter((user) => user.id !== userId),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while approving the user.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: string) => {
    setActionLoading(userId);
    setError("");

    try {
      const response = await fetch(`/api/proxy/admin/users/${userId}`, {
        method: "DELETE",
      });

      const body: ApiResponse = await response.json();

      if (!response.ok || body.status !== "success") {
        throw new Error(body.message || "Failed to delete user");
      }

      setUsers((currentUsers) =>
        currentUsers.filter((user) => user.id !== userId),
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong while deleting the user.",
      );
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    // Initial data fetch requires state updates.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPendingUsers();
  }, []);

  const filteredUsers = users.filter((user) =>
    user.email.toLowerCase().includes(search.toLowerCase()),
  );

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(date));
  };

  return (
    <main className="space-y-8">
      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-600 via-green-600 to-green-700 p-7 text-white shadow-xl">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-emerald-300/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 border border-white/20">
                <Users className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-green-100">
                Access Management
              </span>
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight">
              Staff Requests
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-green-100">
              Review and manage staff accounts waiting for administrative
              approval.
            </p>
          </div>

          <div className="flex h-20 min-w-32 flex-col justify-center rounded-2xl border border-white/20 bg-white/10 px-5 backdrop-blur-xl">
            <span className="text-xs font-medium text-green-100">Pending</span>
            <span className="text-3xl font-bold">{users.length}</span>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-green-950">
            Pending accounts
          </h2>
          <p className="mt-1 text-sm text-green-800/60">
            Accounts awaiting review and approval.
          </p>
        </div>

        <div className="flex gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-700/40" />
            <input
              type="search"
              placeholder="Search email..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full rounded-xl border border-white/80 bg-white/60 py-2.5 pl-9 pr-4 text-sm text-green-950 outline-none backdrop-blur-xl transition-all placeholder:text-green-800/40 focus:border-green-300 focus:ring-4 focus:ring-green-500/10 md:w-56"
            />
          </div>

          <button
            type="button"
            onClick={fetchPendingUsers}
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl border border-white/80 bg-white/60 px-4 py-2.5 text-sm font-semibold text-green-800 shadow-sm backdrop-blur-xl transition-all hover:bg-white/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </section>

      {/* Loading */}
      {loading && (
        <section className="space-y-3">
          {[1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-24 animate-pulse rounded-2xl border border-white/80 bg-white/50 backdrop-blur-xl"
            />
          ))}
        </section>
      )}

      {/* Error */}
      {!loading && error && (
        <section className="rounded-2xl border border-red-200 bg-red-50/70 p-6 backdrop-blur-xl">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <Clock3 className="h-5 w-5" />
            </div>

            <div>
              <h3 className="font-semibold text-red-900">
                Unable to load requests
              </h3>
              <p className="mt-1 text-sm text-red-700/80">{error}</p>

              <button
                type="button"
                onClick={fetchPendingUsers}
                className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Try again
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Empty */}
      {!loading && !error && filteredUsers.length === 0 && (
        <section className="flex min-h-72 flex-col items-center justify-center rounded-3xl border border-white/80 bg-white/50 px-6 text-center shadow-[0_8px_30px_rgba(21,128,61,0.04)] backdrop-blur-2xl">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 text-green-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>

          <h3 className="mt-5 text-lg font-bold text-green-950">
            {search ? "No matching requests" : "You're all caught up"}
          </h3>

          <p className="mt-1 max-w-md text-sm text-green-800/60">
            {search
              ? "No pending account matches your search."
              : "There are currently no staff accounts waiting for approval."}
          </p>
        </section>
      )}

      {/* Requests */}
      {!loading && !error && filteredUsers.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white/50 shadow-[0_8px_30px_rgba(21,128,61,0.05)] backdrop-blur-2xl">
          {/* Desktop header */}
          <div className="hidden grid-cols-[minmax(0,1.5fr)_140px_150px_120px_100px] gap-4 border-b border-green-900/5 bg-white/40 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-green-800/50 md:grid">
            <span>Account</span>
            <span>Role</span>
            <span>Requested</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          <div className="divide-y divide-green-900/5">
            {filteredUsers.map((user) => (
              <article
                key={user.id}
                className="group px-5 py-5 transition-colors hover:bg-white/50 md:px-6"
              >
                <div className="grid gap-5 md:grid-cols-[minmax(0,1.5fr)_140px_150px_120px_100px] md:items-center">
                  {/* Account */}
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-100 text-green-700">
                      <UserRound className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm font-semibold text-green-950">
                        <Mail className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{user.email}</span>
                      </p>

                      <div className="mt-1 text-xs text-green-800/50">
                        <span className="truncate">{user.id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold capitalize text-green-800">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {user.role.toLowerCase()}
                    </span>
                  </div>

                  {/* Date */}
                  <div>
                    <p className="text-sm font-medium text-green-900">
                      {formatDate(user.created_at)}
                    </p>
                    <p className="mt-0.5 text-xs text-green-800/50">
                      Submitted
                    </p>
                  </div>

                  {/* Status */}
                  <div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold capitalize text-amber-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                      {user.status.toLowerCase()}
                    </span>
                  </div>

                  {/* Desktop Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApprove(user.id)}
                      disabled={actionLoading === user.id}
                      className="rounded-lg bg-green-600 p-2 text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Approve ${user.email}`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDelete(user.id)}
                      disabled={actionLoading === user.id}
                      className="rounded-lg bg-red-50 p-2 text-red-500 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete ${user.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Mobile metadata + actions */}
                <div className="mt-4 flex items-center justify-between border-t border-green-900/5 pt-4 md:hidden">
                  <span className="text-xs text-green-800/50">
                    Requested {formatDate(user.created_at)}
                  </span>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApprove(user.id)}
                      disabled={actionLoading === user.id}
                      className="rounded-lg bg-green-600 p-2 text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Approve ${user.email}`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleDelete(user.id)}
                      disabled={actionLoading === user.id}
                      className="rounded-lg bg-red-50 p-2 text-red-500 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Delete ${user.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleApprove(user.id)}
                    disabled={actionLoading === user.id}
                    className="rounded-lg bg-green-600 p-2 text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Approve ${user.email}`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Mobile metadata */}
                <div className="mt-4 flex items-center justify-between border-t border-green-900/5 pt-4 md:hidden">
                  <span className="text-xs text-green-800/50">
                    Requested {formatDate(user.created_at)}
                  </span>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-green-600 p-2 text-white transition hover:bg-green-700"
                      aria-label={`Approve ${user.email}`}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      className="rounded-lg bg-red-50 p-2 text-red-500 transition hover:bg-red-100"
                      aria-label={`Delete ${user.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
