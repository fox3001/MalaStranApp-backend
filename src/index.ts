import { Hono } from "hono";
import { cors } from "hono/cors";

const app = new Hono();

app.use("*", cors());

// Login route
app.post("/api/login", async (c) => {
  const body = await c.req.json();
  const { mode, password, nomeCognome } = body;

  // Admin: solo password
  if (mode === "admin") {
    if (password === "admin") {
      return c.json({
        success: true,
        user: {
          id: "admin",
          nome: "Admin",
          cognome: "",
          role: "admin",
        },
      });
    }
    return c.json(
      { success: false, error: "Password non valida" },
      { status: 401 }
    );
  }

  // User: nomeCognome + password
  if (mode === "user" && nomeCognome && password) {
    const parts = nomeCognome.trim().split(/\s+/);
    if (parts.length < 2) {
      return c.json(
        { success: false, error: "Inserisci nome e cognome" },
        { status: 400 }
      );
    }
    const nome = parts[0];
    const cognome = parts.slice(1).join(" ");

    const users = await c.env.DB.prepare(
      "SELECT * FROM users WHERE nome = ? AND cognome = ? AND password = ?"
    )
      .bind(nome, cognome, password)
      .all();

    if (users.results.length > 0) {
      const user = users.results[0] as any;
      return c.json({
        success: true,
        user: {
          id: user.id,
          nome: user.nome,
          cognome: user.cognome,
          role: user.role || "user",
        },
      });
    }
  }

  return c.json(
    { success: false, error: "Credenziali non valide" },
    { status: 401 }
  );
});

export default app;
