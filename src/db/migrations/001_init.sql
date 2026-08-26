-- Migrazione iniziale: crea tabelle e inserisce dati demo
-- Esegui con: wrangler d1 execute malastranapp-db --file=src/db/migrations/001_init.sql

-- Utenti demo (password = stessa dell'email per semplicità··
-- In produzione usa bcrypt!
INSERT OR IGNORE INTO users (email, password_hash, name, role) VALUES
  ('admin@malastran.com', 'admin123', 'Admin MalaStran', 'admin'),
  ('user1@malastran.com', 'user123', 'Collaboratore Uno', 'user'),
  ('user2@malastran.com', 'user123', 'Collaboratore Due', 'user'),
  ('user3@malastran.com', 'user123', 'Collaboratore Tre', 'user');

-- Eventi demo
INSERT OR IGNORE INTO events (code, title, description, start_date, end_date, location, color) VALUES
  ('halloween2024', 'Halloween 2024', 'Festa di Halloween con costumi e performance', '2024-10-31 20:00:00', '2024-10-31 23:59:00', 'Castello Infestato', '#ff6b00'),
  ('capodanno2025', 'Capodanno 2025', 'Festa di fine anno con spettacolo', '2024-12-31 21:00:00', '2025-01-01 02:00:00', 'Piazza Centrale', '#ffd700'),
  ('primavera2025', 'Primavera 2025', 'Evento di primavera con musica dal vivo', '2025-03-20 18:00:00', '2025-03-20 23:00:00', 'Parco delle Rose', '#00ff88'),
  ('estate2025', 'Estate 2025', 'Grande evento estivo', '2025-06-21 19:00:00', '2025-06-22 02:00:00', 'Spiaggia del Sole', '#00bfff');

-- Collaboratori (collegati agli utenti)
INSERT OR IGNORE INTO collaborators (user_id, phone, notes) VALUES
  ((SELECT id FROM users WHERE email = 'user1@malastran.com'), '+39 333 1111111', 'Disponibile weekend'),
  ((SELECT id FROM users WHERE email = 'user2@malastran.com'), '+39 333 2222222', 'Preferisce eventi serali'),
  ((SELECT id FROM users WHERE email = 'user3@malastran.com'), '+39 333 3333333', 'Nuovo collaboratore');

-- Disponibilità
INSERT OR IGNORE INTO availability (collaborator_id, event_id, is_available, notes) VALUES
  ((SELECT id FROM collaborators WHERE user_id = (SELECT id FROM users WHERE email = 'user1@malastran.com')), 
   (SELECT id FROM events WHERE code = 'halloween2024'), 1, 'Super disponibile!'),
  ((SELECT id FROM collaborators WHERE user_id = (SELECT id FROM users WHERE email = 'user1@malastran.com')), 
   (SELECT id FROM events WHERE code = 'capodanno2025'), 1, NULL),
  ((SELECT id FROM collaborators WHERE user_id = (SELECT id FROM users WHERE email = 'user2@malastran.com')), 
   (SELECT id FROM events WHERE code = 'halloween2024'), 0, 'Non disponibile'),
  ((SELECT id FROM collaborators WHERE user_id = (SELECT id FROM users WHERE email = 'user2@malastran.com')), 
   (SELECT id FROM events WHERE code = 'capodanno2025'), 1, 'OK per capodanno'),
  ((SELECT id FROM collaborators WHERE user_id = (SELECT id FROM users WHERE email = 'user3@malastran.com')), 
   (SELECT id FROM events WHERE code = 'primavera2025'), 1, 'Primo evento');

-- Costumi
INSERT OR IGNORE INTO costumes (name, description, size, event_id) VALUES
  ('Vampiro Classico', 'Capa nera, camicia bianca, finto sangue', 'M', (SELECT id FROM events WHERE code = 'halloween2024')),
  ('Strega Medievale', 'Vestito nero, cappello a punta, scopa', 'L', (SELECT id FROM events WHERE code = 'halloween2024')),
  ('Angelo', 'Tunica bianca, ali dorate, aureola', 'M', (SELECT id FROM events WHERE code = 'capodanno2025')),
  ('Maschera Veneziana', 'Abito elegante, maschera decorata', 'XL', (SELECT id FROM events WHERE code = 'capodanno2025')),
  ('Folletto', 'Costume verde, orecchie a punta, scarpe ricurve', 'S', (SELECT id FROM events WHERE code = 'primavera2025')),
  ('Sirena', 'Coda di sirena, top scintillante', 'M', (SELECT id FROM events WHERE code = 'estate2025'));

-- Materiali
INSERT OR IGNORE INTO materials (name, description, quantity, event_id) VALUES
  ('Luci LED', 'Strisce LED colorate per scenografia', 10, (SELECT id FROM events WHERE code = 'halloween2024')),
  ('Macchina del fumo', 'Per effetti speciali', 2, (SELECT id FROM events WHERE code = 'halloween2024')),
  ('Coriandoli', 'Coriandoli dorati e argentati', 20, (SELECT id FROM events WHERE code = 'capodanno2025')),
  ('Bottiglie champagne', 'Champagne per brindisi', 12, (SELECT id FROM events WHERE code = 'capodanno2025')),
  ('Fiori finti', 'Decorazioni floreali', 30, (SELECT id FROM events WHERE code = 'primavera2025')),
  ('Teli da spiaggia', 'Teli colorati per area VIP', 15, (SELECT id FROM events WHERE code = 'estate2025'));

-- Assegnazioni
INSERT OR IGNORE INTO assignments (collaborator_id, event_id, costume_id, material_id, notes) VALUES
  ((SELECT id FROM collaborators WHERE user_id = (SELECT id FROM users WHERE email = 'user1@malastran.com')),
   (SELECT id FROM events WHERE code = 'halloween2024'),
   (SELECT id FROM costumes WHERE name = 'Vampiro Classico'),
   (SELECT id FROM materials WHERE name = 'Luci LED'),
   'Responsabile illuminazione'),
  ((SELECT id FROM collaborators WHERE user_id = (SELECT id FROM users WHERE email = 'user2@malastran.com')),
   (SELECT id FROM events WHERE code = 'capodanno2025'),
   (SELECT id FROM costumes WHERE name = 'Angelo'),
   NULL,
   'Aiuta con i coriandoli');

-- Notifiche
INSERT OR IGNORE INTO notifications (user_id, title, message, type) VALUES
  ((SELECT id FROM users WHERE email = 'user1@malastran.com'), 'Benvenuto!', 'Il tuo account è stato creato. Buon lavoro!', 'success'),
  ((SELECT id FROM users WHERE email = 'user2@malastran.com'), 'Benvenuto!', 'Il tuo account è stato creato. Buon lavoro!', 'success'),
  ((SELECT id FROM users WHERE email = 'user3@malastran.com'), 'Benvenuto!', 'Il tuo account è stato creato. Buon lavoro!', 'success');
