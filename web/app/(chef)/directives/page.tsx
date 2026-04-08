"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Directive = {
  id: string;
  directive_text: string;
  issued_by: string | null;
  created_at: string;
  chef_acknowledged_at: string | null;
  member: {
    id: string;
    display_name: string | null;
    full_name: string | null;
  } | null;
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export default function DirectivesPage() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [loading, setLoading] = useState(true);
  const [chefId, setChefId] = useState<string | null>(null);

  const load = async (id: string) => {
    const { data } = await supabase
      .from("dietary_directives")
      .select(
        "id, directive_text, issued_by, created_at, chef_acknowledged_at, member:member_id (id, display_name, full_name)"
      )
      .eq("chef_id", id)
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setDirectives((data as unknown as Directive[]) || []);
  };

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const id = sessionData.session?.user.id ?? null;
      setChefId(id);
      if (id) await load(id);
      setLoading(false);
    })();
  }, []);

  const acknowledge = async (id: string) => {
    if (!chefId) return;
    const { error } = await supabase
      .from("dietary_directives")
      .update({ chef_acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) await load(chefId);
  };

  if (loading) {
    return <div className="p-12 text-dust">Loading...</div>;
  }

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-parchment">Directives</h1>
        <p className="text-dust mt-1">{directives.length} active</p>
      </header>

      <div className="space-y-4">
        {directives.map((d) => {
          const memberName =
            d.member?.display_name || d.member?.full_name || "Unknown member";
          return (
            <div
              key={d.id}
              className="bg-charcoal border border-slate rounded-xl p-6 hover:border-ember transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-parchment">
                    {memberName}
                  </h2>
                  <p className="text-parchment mt-2">{d.directive_text}</p>
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    {d.issued_by && (
                      <span className="text-xs bg-forge text-ember border border-ember px-2 py-1 rounded">
                        {d.issued_by}
                      </span>
                    )}
                    <span className="text-dust text-xs">
                      {relativeTime(d.created_at)}
                    </span>
                    {d.chef_acknowledged_at && (
                      <span className="text-xs text-dust">
                        Acknowledged {relativeTime(d.chef_acknowledged_at)}
                      </span>
                    )}
                  </div>
                </div>
                {!d.chef_acknowledged_at && (
                  <button
                    onClick={() => acknowledge(d.id)}
                    className="bg-ember text-forge font-bold py-2 px-4 rounded-lg hover:bg-flame transition shrink-0"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
