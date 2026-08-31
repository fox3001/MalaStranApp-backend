-- Admin
INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Simone',
  'Fox',
  NULL,
  'aad34d3b351869adb0e424a193e3137ee11c57d02d45c105c6c5043c1df3490d',
  'admin'
);

-- User 1: Luna Rinaldi - password: luna123
INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Luna',
  'Rinaldi',
  NULL,
  '0d84d0a3b3b0f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3',
  'user'
);

-- User 2: Marco De Santis - password: marco123
INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Marco',
  'De Santis',
  NULL,
  '0d84d0a3b3b0f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e3f3e4',
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
