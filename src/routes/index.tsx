import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck, UserRound, ArrowLeft, LogIn } from "lucide-react";
import { FormEvent, useState } from "react";

export const Route = createFileRoute("/")({ component: Home });
type AccessMode = "choice" | "collaborator" | "admin";
type DemoCredential = { id: string; username: string; password: string; displayName: string };
const CREDENTIALS_KEY = "malastrana-demo-credentials";
const builtInCollaborators: DemoCredential[] = [
  { id: "col-marco", username: "Marco Rossi", password: "Rossi", displayName: "Marco Rossi" },
  { id: "col-elena", username: "Elena Santo", password: "Santo", displayName: "Elena Santo" },
];

function Home() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<AccessMode>("choice");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const reset = () => { setMode("choice"); setUsername(""); setPassword(""); setError(""); };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError("");
    if (mode === "admin") { if (password !== "admin") { setError("Password non corretta."); return; } window.localStorage.setItem("malastrana-admin-access", "true"); void navigate({ to: "/admin" }); return; }
    let createdCredentials: DemoCredential[] = [];
    try { createdCredentials = JSON.parse(window.localStorage.getItem(CREDENTIALS_KEY) || "[]") as DemoCredential[]; } catch {}
    const collaborator = [...builtInCollaborators, ...createdCredentials].find((item) => item.username.toLocaleLowerCase() === username.trim().toLocaleLowerCase() && item.password === password.trim());
    if (!collaborator) { setError("Nome utente o password non corretti."); return; }
    window.localStorage.setItem("malastrana-collaborator-access", "true");
    window.localStorage.setItem("malastrana-collaborator-id", collaborator.id);
    window.localStorage.setItem("malastrana-collaborator-name", collaborator.displayName);
    void navigate({ to: "/u" });
  };
  if (mode !== "choice") { const admin = mode === "admin"; return <main className="parchment-bg flex min-h-screen flex-col items-center justify-center px-6 py-10"><div className="w-full max-w-sm"><button type="button" onClick={reset} className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"><ArrowLeft className="h-4 w-4" /> Torna a Chi sei?</button><div className="mb-8 flex justify-center"><img src="/malastrana-logo.png" alt="Malastrana App" className="h-auto w-48 object-contain" /></div><section className="rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)]"><div className="mb-6 flex items-center gap-3"><span className={`flex h-12 w-12 items-center justify-center rounded-lg text-white ${admin ? "bg-accent" : "bg-primary"}`}>{admin ? <ShieldCheck className="h-6 w-6" strokeWidth={1.5} /> : <UserRound className="h-6 w-6" strokeWidth={1.5} />}</span><div><p className="eyebrow text-muted-foreground">Accesso</p><h1 className="font-serif text-2xl text-primary">{admin ? "Admin" : "Collaboratore"}</h1></div></div><form className="grid gap-4" onSubmit={submit}>{!admin && <label className="grid gap-2 text-sm font-medium text-foreground">Nome utente<input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nome Cognome" autoComplete="username" className="rounded-lg border border-border bg-background px-3 py-3 text-base outline-none" /></label>}<label className="grid gap-2 text-sm font-medium text-foreground">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Inserisci la password" autoComplete="current-password" className="rounded-lg border border-border bg-background px-3 py-3 text-base outline-none" autoFocus={admin} /></label>{error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}<button type="submit" className={`mt-2 flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-semibold text-white ${admin ? "bg-accent" : "bg-primary"}`}><LogIn className="h-5 w-5" /> Entra</button></form></section><p className="mt-5 text-center text-sm leading-6 text-muted-foreground">{admin ? "Area riservata a Ufficio e Regia." : "Accedi con le credenziali assegnate dall'Admin."}</p></div></main>; }
  return <main className="parchment-bg flex min-h-screen flex-col items-center justify-center px-6 py-10"><div className="w-full max-w-sm"><div className="mb-10 flex justify-center"><img src="/malastrana-logo.png" alt="Malastrana App" className="h-auto w-56 object-contain" /></div><p className="eyebrow mb-4 text-center text-muted-foreground">Chi sei?</p><div className="grid gap-4"><button type="button" onClick={() => setMode("collaborator")} className="group flex items-center gap-4 rounded-xl border border-primary bg-primary px-5 py-5 text-left text-white shadow-[var(--shadow-card)] transition-all active:scale-[0.98]"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/15"><UserRound className="h-6 w-6" strokeWidth={1.5} /></span><span><span className="block text-base font-semibold uppercase tracking-[0.1em]">Collaboratore</span><span className="mt-1 block text-sm text-white/85">Accedi con nome utente e password</span></span></button><button type="button" onClick={() => setMode("admin")} className="group flex items-center gap-4 rounded-xl border border-accent bg-accent px-5 py-5 text-left text-white shadow-[var(--shadow-card)] transition-all active:scale-[0.98]"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/15"><ShieldCheck className="h-6 w-6" strokeWidth={1.5} /></span><span><span className="block text-base font-semibold uppercase tracking-[0.1em]">Admin</span><span className="mt-1 block text-sm text-white/85">Area riservata a Ufficio e Regia</span></span></button></div></div></main>; }
