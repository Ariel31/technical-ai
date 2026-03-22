"use client";

import { useQuery } from "@tanstack/react-query";
import AppHeader from "@/components/ui/AppHeader";
import { Users, Loader2 } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface SignedUpUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  created_at: string;
  last_seen: string;
}

export default function AdminPage() {
  const { data: users = [], isLoading, isError } = useQuery<SignedUpUser[]>({
    queryKey: ["admin-users"],
    queryFn: () => fetch("/api/admin/clients").then(async (r) => {
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Error ${r.status}`);
      }
      return r.json();
    }),
    retry: false,
  });

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      <AppHeader activePage={null} />

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto flex flex-col gap-6">

          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
              <Users className="w-5 h-5 text-accent" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Signed-Up Users</h1>
              <p className="text-sm text-muted-foreground">
                {isLoading ? "Loading…" : `${users.length} user${users.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>

          {/* States */}
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {isError && (
            <div className="rounded-xl border border-bear/30 bg-bear/10 p-6 text-center text-sm text-bear">
              {(isError as unknown as Error)?.message ?? "Access denied or failed to load users."}
            </div>
          )}

          {!isLoading && !isError && users.length === 0 && (
            <div className="rounded-xl border border-border bg-surface/40 p-10 text-center text-sm text-muted-foreground">
              No users have signed up yet.
            </div>
          )}

          {!isLoading && !isError && users.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface/80">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Signed Up</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr
                      key={u.id}
                      className={cn(
                        "border-b border-border/50 last:border-0 hover:bg-surface/40 transition-colors",
                        i % 2 === 0 ? "bg-transparent" : "bg-surface/20"
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {u.image ? (
                            <Image
                              src={u.image}
                              alt={u.name ?? u.email}
                              width={32}
                              height={32}
                              className="rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-semibold text-accent">
                              {(u.name ?? u.email)[0].toUpperCase()}
                            </div>
                          )}
                          <span className="font-medium text-foreground">{u.name ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{u.email}</td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell whitespace-nowrap">
                        {new Date(u.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell whitespace-nowrap">
                        {new Date(u.last_seen).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
