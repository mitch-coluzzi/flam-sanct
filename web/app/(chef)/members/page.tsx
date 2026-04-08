"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Member = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  email: string | null;
  f3_name: string | null;
};

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const chefId = sessionData.session?.user.id;
      if (!chefId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("chef_assignments")
        .select(
          "member:member_id (id, display_name, full_name, email, f3_name)"
        )
        .eq("chef_id", chefId)
        .eq("active", true);

      if (!error && data) {
        const list: Member[] = data
          .map((row: any) => row.member)
          .filter((m: any) => m);
        setMembers(list);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="p-12 text-dust">Loading...</div>;
  }

  return (
    <div className="p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-parchment">Members</h1>
        <p className="text-dust mt-1">{members.length} assigned</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {members.map((m) => (
          <Link key={m.id} href={`/members/${m.id}`}>
            <div className="bg-charcoal border border-slate rounded-xl p-6 hover:border-ember transition">
              <h2 className="text-xl font-bold text-parchment">
                {m.display_name || m.full_name || "Unnamed"}
              </h2>
              {m.full_name && m.display_name && (
                <p className="text-dust text-sm mt-1">{m.full_name}</p>
              )}
              {m.email && (
                <p className="text-dust text-sm mt-2">{m.email}</p>
              )}
              {m.f3_name && (
                <span className="inline-block mt-3 text-xs bg-forge text-ember border border-ember px-2 py-1 rounded">
                  F3: {m.f3_name}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
