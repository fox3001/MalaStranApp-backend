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
  'c6b102feea5a97dd9d42a57b35be7dd2bf2266689e71d53b589c5643490dc5b8',
  'user'
);

-- User 2: Marco De Santis - password: marco123
INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Marco',
  'De Santis',
  NULL,
  'ed841ad54712969b76e74e604746afd4f7d7b154091eb5bdc578ac0b66cd57b1',
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
