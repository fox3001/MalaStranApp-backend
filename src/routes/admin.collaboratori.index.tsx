import { createFileRoute, Link } from "@tanstack/react-router";
import { FormEvent, useState } from "react";
import { Plus, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar, DemoNote, Tags } from "@/components/ui-kit";
import { useDemo } from "@/lib/store";

export const Route = createFileRoute("/admin/collaboratori/")({ component: AdminCollaboratori });

type DemoCredential = { id: string; username: string; password: string; displayName: string };
const CREDENTIALS_KEY = "malastrana-demo-credentials";

function AdminCollaboratori() {
  const { collaborators, addCollaborator } = useDemo();
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const query = q.trim().toLowerCase();
  const list = collaborators.filter((c) => !query || c.name.toLowerCase().includes(query) || c.role.toLowerCase().includes(query) || c.skills.some((s) => s.toLowerCase().includes(query.replace("#", ""))));

  const createCollaborator = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim().replace(/\s+/g, " ");
    if (normalizedName.split(" ").length < 2 || !password.trim()) { setMessage("Inserisci nome e cognome e una password iniziale."); return; }
    const id = addCollaborator({ name: normalizedName, role: role.trim() || "Collaboratore" });
    let credentials: DemoCredential[] = [];
    try { credentials = JSON.parse(window.localStorage.getItem(CREDENTIALS_KEY) || "[]") as DemoCredential[]; } catch {}
    window.localStorage.setItem(CREDENTIALS_KEY, JSON.stringify([...credentials, { id, username: normalizedName, password: password.trim(), displayName: normalizedName }]));
    setMessage(`Creato ${normalizedName}. Username: ${normalizedName}`);
    setName(""); setRole(""); setPassword(""); setShowForm(false);
  };

  return <AppShell area="admin" title="Collaboratori"><section className="px-3 pt-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-serif text-2xl text-foreground">Rubrica</h2><p className="mt-1 text-sm text-muted-foreground">Cerca per nome, ruolo o hashtag di competenza.</p></div><button type="button" onClick={() => { setShowForm(true); setMessage(""); }} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground"><Plus className="h-4 w-4" /> Nuovo</button></div><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca…" className="mt-4 min-h-12 w-full border border-border-strong bg-surface px-3 text-sm text-foreground" />{message && <p className="mt-3 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{message}</p>}</section>{showForm && <section className="mx-3 mt-5 rounded-xl border border-accent bg-card p-4 shadow-[var(--shadow-card)]"><div className="mb-4 flex items-center justify-between"><div><p className="eyebrow text-accent">Admin</p><h3 className="font-serif text-xl text-primary">Nuovo collaboratore</h3></div><button type="button" onClick={() => setShowForm(false)} className="rounded p-1 text-muted-foreground"><X className="h-5 w-5" /></button></div><form className="grid gap-3" onSubmit={createCollaborator}><label className="grid gap-1 text-sm font-medium text-foreground">Nome e cognome<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Andrea Verdi" className="rounded-lg border border-border bg-surface px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium text-foreground">Ruolo<input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Es. Performer" className="rounded-lg border border-border bg-surface px-3 py-2" /></label><label className="grid gap-1 text-sm font-medium text-foreground">Password iniziale<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Scegli una password" className="rounded-lg border border-border bg-surface px-3 py-2" /></label><button type="submit" className="mt-1 rounded-lg bg-accent px-4 py-3 font-semibold text-accent-foreground">Crea collaboratore</button></form></section>}<ul className="mt-5 border-t border-border">{list.map((c) => <li key={c.id}><Link to="/admin/collaboratori/$id" params={{ id: c.id }} className="flex gap-3 border-b border-border px-3 py-3.5 active:bg-muted"><Avatar name={c.name} /><span className="min-w-0 flex-1"><span className="block truncate font-serif text-base text-foreground">{c.name}</span><span className="block truncate text-xs text-muted-foreground">{c.role}</span><span className="mt-1.5 block"><Tags tags={c.skills.slice(0, 4)} /></span></span><span className="eyebrow shrink-0 text-accent">{c.state}</span></Link></li>)}{list.length === 0 && <li className="px-3 py-6 text-sm text-muted-foreground">Nessun collaboratore trovato.</li>}</ul><div className="mt-8 px-3"><DemoNote /></div></AppShell>;
}
