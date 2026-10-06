// Evento di PROVA creato una sola volta su richiesta dell'admin (6 ottobre 2026):
// la bolla di carico è copiata dal file "7Feb26_OaC6_Villa_Longoni - BOLLA BASE".
// Tutti gli user attivi ricevono la richiesta di disponibilità. Si può eliminare dall'app quando non serve più.

type Row = [categoria: string, item: string, quantita: number, note: string];

const SCENA = "Scena del crimine (studio Dr Maudsley)";
const HARKIN = "Dr Harkin, psicologo, assassino (studio)";
const TUMBLETY = "Francis Tumblety, ipnoterapista, vero assassino (salotto ricco all'inglese)";
const NELLY = "Nelly Maudsley, figlia della vittima, complice (stanza figlia)";
const RALPH = "Ralph Maudsley, figlio della vittima (stanza figlio)";
const AGATHA = "Agatha Maudsley, sorella della vittima, internata (stanza zia Agatha)";
const kit = (dest: string, extra: string) => (extra ? `${dest} — ${extra}` : dest);

const ROWS: Row[] = [
  ["Accoglienza", "Regole per il pubblico", 8, ""],
  ["Accoglienza", "Vademecum del detective", 80, ""],
  ["Accoglienza", "Registro gruppi", 10, ""],
  ["Accoglienza", "Domande pubblico", 80, ""],
  ["Accoglienza", "Giornali", 10, ""],
  ["Accoglienza", "Taccuini Monsardens", 50, ""],
  ["Accoglienza", "Matite per il pubblico", 50, ""],
  ["Accoglienza", "Temperino", 1, ""],
  ["Accoglienza", "Penna", 1, ""],
  ["Accoglienza", "Chiavi Gringott", 70, ""],
  ["Accoglienza · Busta delle necessità", "Scotch di carta", 1, ""],
  ["Accoglienza · Busta delle necessità", "Forbici", 1, ""],
  ["Accoglienza · Busta delle necessità", "Spago", 1, ""],
  ["Accoglienza · Busta delle necessità", "Penne", 1, ""],
  ["Accoglienza · Busta delle necessità", "Pennarelli", 1, ""],
  ["Accoglienza · Luci", "Faretti piccoli", 1, ""],
  ["Accoglienza · Luci", "Samla candele finte", 1, "Negli oggetti importanti"],
  ["Accoglienza · Generico", "Prolunghe", 1, ""],
  ["Accoglienza · Generico", "Ciniglie e tovaglie", 1, ""],
  ["Accoglienza · Generico", "Jute", 1, ""],
  ["Accoglienza · Generico", "Segnalini", 1, ""],
  ["Detective · Oggetti importanti", "Cassa audio", 1, "5"],
  ["Detective · Oggetti importanti", "Radio", 1, ""],
  ["Detective · Oggetti importanti", "Giornali?", 1, "x"],
  ["Detective · Oggetti importanti", "Libro finto", 1, ""],
  ["Detective · Oggetti importanti", "Distintivi", 2, "Valigetta accoglienza"],
  ["Oggetti importanti · Scena del crimine", "Volumi medici (Freud)", 1, kit(SCENA, "X")],
  ["Oggetti importanti · Scena del crimine", "Scotch per sagoma vittima", 1, SCENA],
  ["Oggetti importanti · Scena del crimine", "Oggetto di vetro rotto con tracce di sangue", 1, kit(SCENA, "x")],
  ["Oggetti importanti · Scena del crimine", "Dischi tra cui quello di conferenza", 1, kit(SCENA, "Nascondere custodie")],
  ["Oggetti importanti · Scena del crimine", "Bottiglia e bicchiere usato", 1, kit(SCENA, "Nel kit")],
  ["Oggetti importanti · Scena del crimine", "Ordine per internare figlio", 1, SCENA],
  ["Oggetti importanti · Scena del crimine", "Cintura moderna, elegante semplice", 1, SCENA],
  ["Oggetti importanti · Scena del crimine", "Clessidra", 1, SCENA],
  ["Oggetti importanti · Scena del crimine", "Materiale da studio", 1, kit(SCENA, "Kit studio")],
  ["Oggetti importanti · Dr Harkin", "Clessidra", 1, HARKIN],
  ["Oggetti importanti · Dr Harkin", "Volumi medici Jung", 1, HARKIN],
  ["Oggetti importanti · Dr Harkin", "Materiale da studio", 1, kit(HARKIN, "Kit")],
  ["Oggetti importanti · Dr Harkin", "Valigetta medico", 1, HARKIN],
  ["Oggetti importanti · Dr Harkin", "Flaconi medicinali", 1, kit(HARKIN, "Kit")],
  ["Oggetti importanti · Dr Harkin", "Quaderno poesie Ralph", 1, HARKIN],
  ["Oggetti importanti · Dr Harkin", "Forbicine con sangue", 1, HARKIN],
  ["Oggetti importanti · Francis Tumblety", "Clessidra", 1, TUMBLETY],
  ["Oggetti importanti · Francis Tumblety", "Statuetta insanguinata", 1, TUMBLETY],
  ["Oggetti importanti · Francis Tumblety", "Chiave con targhetta", 1, TUMBLETY],
  ["Oggetti importanti · Francis Tumblety", "Guanti eleganti bianchi uomo", 1, TUMBLETY],
  ["Oggetti importanti · Nelly Maudsley", "Clessidra", 1, NELLY],
  ["Oggetti importanti · Nelly Maudsley", "Frammenti lettera", 1, NELLY],
  ["Oggetti importanti · Nelly Maudsley", "Bicchiere champagne", 1, NELLY],
  ["Oggetti importanti · Ralph Maudsley", "Clessidra", 1, RALPH],
  ["Oggetti importanti · Ralph Maudsley", "Flacone anestetici", 1, kit(RALPH, "Kit")],
  ["Oggetti importanti · Agatha Maudsley", "Clessidra", 1, AGATHA],
  ["Oggetti importanti · Agatha Maudsley", "Fazzoletto insanguinato", 1, AGATHA],
  ["Oggetti importanti · Agatha Maudsley", "Cuscino", 1, AGATHA],
  ["Oggetti importanti · Agatha Maudsley", "Camera ospedale", 1, kit(AGATHA, "Kit")],
  ["Oggetti importanti · Agatha Maudsley", "Lenzuolo", 1, AGATHA],
  ["Oggetti importanti · Agatha Maudsley", "Brandina", 1, AGATHA],
  ["Allestimenti", "Kit studio", 1, "Scena del crimine — FUCSIA"],
  ["Allestimenti", "Kit medico + quaderni Dx1G", 1, "Dr. Harkin — VERDE"],
  ["Allestimenti", "Kit figlio/ragazzo + 2 libri veri", 1, "Francis Tumblety — VERDE"],
  ["Allestimenti", "Kit camera", 1, "Nelly Maudsley — ROSSA"],
  ["Allestimenti", "Kit artista", 1, "Ralph Maudsley — AZZURRO"],
  ["Allestimenti", "Camera ospedale", 1, "Agatha Maudsley — GIALLO"],
  ["Costumi · Detective 1", "Distintivo", 1, ""],
  ["Costumi · Detective 1", "Fedora", 1, ""],
  ["Costumi · Detective 1", "Bretelle", 1, ""],
  ["Costumi · Detective 1", "Cappotto", 1, ""],
  ["Costumi · Detective 1", "Cravatta", 1, ""],
  ["Costumi · Detective 2", "Distintivo", 1, ""],
  ["Costumi · Detective 2", "Fedora", 1, ""],
  ["Costumi · Detective 2", "Bretelle", 1, ""],
  ["Costumi · Detective 2", "Cappotto", 1, ""],
  ["Costumi · Detective 2", "Cravatta", 1, ""],
  ["Costumi · Dr Harkin", "Manette", 1, ""],
  ["Costumi · Dr Harkin", "Abito elegante da prof", 1, ""],
  ["Costumi · Francis Tumblety", "Abito elegante ma pacchiano", 1, ""],
  ["Costumi · Francis Tumblety", "Pendolo da ipnotista", 1, ""],
  ["Costumi · Francis Tumblety", "Occhiali", 1, ""],
  ["Costumi · Francis Tumblety", "Trucchi", 1, ""],
  ["Costumi · Francis Tumblety", "Gilet", 1, ""],
  ["Costumi · Nelly Maudsley", "Abito elegante colorato (no nero o scuro!)", 1, ""],
  ["Costumi · Nelly Maudsley", "Abito blu pizzo", 1, ""],
  ["Costumi · Nelly Maudsley", "Guanti bianchi", 1, ""],
  ["Costumi · Nelly Maudsley", "Abito blu e bianco", 1, ""],
  ["Costumi · Nelly Maudsley", "Collana perle", 1, ""],
  ["Costumi · Nelly Maudsley", "Abito oro frange", 1, ""],
  ["Costumi · Nelly Maudsley", "Tailleur blu", 1, ""],
  ["Costumi · Ralph Maudsley", "Vestaglia", 1, ""],
  ["Costumi · Ralph Maudsley", "Vestito dismesso", 1, ""],
  ["Costumi · Ralph Maudsley", "Fasciatura insanguinata", 1, "Negli oggetti importanti"],
  ["Costumi · Agatha Maudsley", "Tunica bianca", 1, ""],
  ["Costumi · Agatha Maudsley", "Pelliccia", 1, ""],
  ["Costumi · Agatha Maudsley", "Trucco esagerato", 1, ""],
  ["Costumi · Agatha Maudsley", "Abito elegante", 1, ""],
  ["Costumi · Agatha Maudsley", "Vestaglia", 1, ""],
  ["Costumi · Agatha Maudsley", "Ciabatte", 1, ""],
];

export const SEED_EVENT_CODE = "MAL-261106-PROVA";

export async function seedVillaLongoni(db: D1Database): Promise<void> {
  const exists = await db.prepare("SELECT id FROM events WHERE code = ?").bind(SEED_EVENT_CODE).first();
  if (exists) return;
  const nome = "PROVA – OaC6 Villa Longoni";
  await db
    .prepare(
      `INSERT INTO events (code, nome, data, ora_ritrovo, ora_inizio, ora_fine, luogo, tipo, descrizione, info_operative, note_admin, stato)
       VALUES (?, ?, '2026-11-06', '', '', '', 'Villa Longoni', 'Omicidio a cena', ?, ?, ?, 'richiesta')`,
    )
    .bind(
      SEED_EVENT_CODE,
      nome,
      "Evento di prova creato per testare l'app. Bolla di carico copiata da «7Feb26 OaC6 Villa Longoni – BOLLA BASE».",
      "Kit colorati: Scena del crimine FUCSIA, Dr Harkin VERDE, Francis Tumblety VERDE, Nelly ROSSA, Ralph AZZURRO, Agatha GIALLO.",
      "Evento di prova: eliminalo quando hai finito i test.",
    )
    .run();
  const ev = await db.prepare("SELECT id FROM events WHERE code = ?").bind(SEED_EVENT_CODE).first<{ id: number }>();
  if (!ev) return;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < ROWS.length; i += 10) {
    const chunk = ROWS.slice(i, i + 10);
    stmts.push(
      db
        .prepare(`INSERT INTO load_rows (event_id, categoria, item, quantita, note) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?)").join(", ")}`)
        .bind(...chunk.flatMap(([cat, item, q, note]) => [ev.id, cat, item, q, note || null])),
    );
  }
  const users = await db.prepare("SELECT id FROM users WHERE ruolo = 'user' AND attivo = 1").all<{ id: number }>();
  for (const u of users.results) {
    stmts.push(db.prepare("INSERT OR IGNORE INTO event_participants (event_id, user_id, stato) VALUES (?, ?, 'pending')").bind(ev.id, u.id));
    stmts.push(
      db.prepare("INSERT INTO notifications (user_id, for_admin, type, message, event_id) VALUES (?, 0, 'richiesta', ?, ?)").bind(u.id, `Nuova richiesta di disponibilità per ${nome}`, ev.id),
    );
  }
  await db.batch(stmts);
}
