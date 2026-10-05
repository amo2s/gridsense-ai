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
import RequestsGreeting from "@/components/dashboard/requests/requests-greeting";
import { Button } from "@/components/ui/button";

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
      const token = sessionStorage.getItem("access_token");
      const response = await fetch("/api/proxy/admin/users/pending", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
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
      const token = sessionStorage.getItem("access_token");
      const response = await fetch(`/api/proxy/admin/users/${userId}/approve`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`
        }
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
      const token = sessionStorage.getItem("access_token");
      const response = await fetch(`/api/proxy/admin/users/${userId}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
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
    <main>
      <RequestsGreeting pendingCount={users.length} activeCount={0} resolvedCount={0}>
        
        {/* Toolbar */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
          <div className="flex gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-100/40" />
              <input
                type="search"
                placeholder="Search email..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-xl border border-white/20 bg-white/5 py-2.5 pl-9 pr-4 text-sm text-white outline-none transition-all placeholder:text-emerald-100/40 focus:border-emerald-500 focus:bg-white/10"
              />
            </div>
            <button
              type="button"
              onClick={fetchPendingUsers}
              disabled={loading}
              className="flex items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-emerald-100 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/5"
              />
            ))}
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/20 text-red-200">
                <Clock3 className="h-5 w-5" />
              </div>

              <div>
                <h3 className="font-semibold text-red-100">
                  Unable to load requests
                </h3>
                <p className="mt-1 text-sm text-red-200/80">{error}</p>

                <button
                  type="button"
                  onClick={fetchPendingUsers}
                  className="mt-4 rounded-lg bg-red-500/20 px-4 py-2 text-xs font-semibold text-red-100 border border-red-500/30 transition hover:bg-red-500/30"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Empty */}
        {!loading && !error && filteredUsers.length === 0 && (
          <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="h-8 w-8" />
            </div>

            <h3 className="mt-5 text-lg font-bold text-white">
              {search ? "No matching requests" : "You're all caught up"}
            </h3>

            <p className="mt-1 max-w-md text-sm text-emerald-100/70">
              {search
                ? "No pending account matches your search."
                : "There are currently no staff accounts waiting for approval."}
            </p>
          </div>
        )}

        {/* Requests List */}
        {!loading && !error && filteredUsers.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {/* Desktop header */}
            <div className="hidden grid-cols-[minmax(0,1.5fr)_140px_150px_120px_100px] gap-4 border-b border-white/10 bg-black/20 px-6 py-4 text-xs font-semibold uppercase tracking-wider text-emerald-100/60 md:grid">
              <span>Account</span>
              <span>Role</span>
              <span>Requested</span>
              <span>Status</span>
              <span>Actions</span>
            </div>

            <div className="divide-y divide-white/10">
              {filteredUsers.map((user) => (
                <article
                  key={user.id}
                  className="group px-5 py-5 transition-colors hover:bg-white/5 md:px-6"
                >
                  <div className="grid gap-5 md:grid-cols-[minmax(0,1.5fr)_140px_150px_120px_100px] md:items-center">
                    {/* Account */}
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        <UserRound className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate text-sm font-semibold text-white">
                          <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                          <span className="truncate">{user.email}</span>
                        </p>

                        <div className="mt-1 text-xs text-emerald-100/50">
                          <span className="truncate">{user.id}</span>
                        </div>
                      </div>
                    </div>

                    {/* Role */}
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-semibold capitalize text-emerald-200">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {user.role.toLowerCase()}
                      </span>
                    </div>

                    {/* Date */}
                    <div>
                      <p className="text-sm font-medium text-emerald-100">
                        {formatDate(user.created_at)}
                      </p>
                      <p className="mt-0.5 text-xs text-emerald-100/50">
                        Submitted
                      </p>
                    </div>

                    {/* Status */}
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 text-xs font-semibold capitalize text-amber-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        {user.status.toLowerCase()}
                      </span>
                    </div>

                    {/* Desktop Actions */}
                    <div className="hidden md:flex items-center gap-2">
                      <Button
                        type="button"
                        onClick={() => void handleApprove(user.id)}
                        disabled={actionLoading === user.id}
                        className="bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/40"
                        aria-label={`Approve ${user.email}`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>

                      <button
                        type="button"
                        onClick={() => void handleDelete(user.id)}
                        disabled={actionLoading === user.id}
                        className="rounded-lg bg-red-500/10 p-2.5 text-red-400 border border-red-500/20 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Delete ${user.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Mobile metadata + actions */}
                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 md:hidden">
                    <span className="text-xs text-emerald-100/50">
                      Requested {formatDate(user.created_at)}
                    </span>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        onClick={() => void handleApprove(user.id)}
                        disabled={actionLoading === user.id}
                        className="bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/40"
                        aria-label={`Approve ${user.email}`}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>

                      <button
                        type="button"
                        onClick={() => void handleDelete(user.id)}
                        disabled={actionLoading === user.id}
                        className="rounded-lg bg-red-500/10 p-2.5 text-red-400 border border-red-500/20 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label={`Delete ${user.email}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </RequestsGreeting>
    </main>
  );
}
