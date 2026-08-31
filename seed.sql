-- Account tecnico per l’accesso Admin.
-- L’accesso Admin avviene solo con la password "admin".
INSERT INTO users (nome, cognome, email, password_hash, ruolo)
VALUES (
  'Admin',
  'Malastrana',
  NULL,
  'aad34d3b351869adb0e424a193e3137ee11c57d02d45c105c6c5043c1df3490d',
  'admin'
);

-- Evento demo creato dall’account tecnico Admin.
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
