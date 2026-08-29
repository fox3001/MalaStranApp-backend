-- Admin
INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Simone',
  'Fox',
  'simone.fox3001@gmail.com',
  'c5d3d85fe94811e15f27d7e4aa80c2f33e3c8e3a8f3d0c6e3f3a3b3c3d3e3f3a',
  'admin'
);

-- User 1
INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Luna',
  'Rinaldi',
  NULL,
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
  'user'
);

-- User 2
INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Marco',
  'De Santis',
  NULL,
  'b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
  'user'
);

-- Evento demo
INSERT INTO events (titolo, data, ora_inizio, ora_fine, luogo, note, creato_da)
VALUES (
  'Prova evento',
  '2026-09-05',
  '18:00',
  '22:00',
  'Via Roma 1',
  'Evento creato dallo script di seed',
  1
);
