CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
INSERT INTO settings(id,value) VALUES(1,'{"enabled":false,"maxDays":7,"noticeHours":2,"duration":30,"weekly":[[],[],[],[],[],[],[]],"overrides":{},"blocks":[]}');
CREATE TABLE appointments (
  ref TEXT PRIMARY KEY, nombre TEXT NOT NULL, telefono TEXT NOT NULL,
  fecha TEXT NOT NULL, hora TEXT NOT NULL, inicio INTEGER NOT NULL, fin INTEGER NOT NULL CHECK(fin>inicio),
  notas TEXT NOT NULL DEFAULT '', estado TEXT NOT NULL CHECK(estado IN ('pendiente','confirmada','cancelada')),
  origen TEXT NOT NULL CHECK(origen IN ('web','manual')), creada TEXT NOT NULL
);
CREATE INDEX appointments_date ON appointments(fecha,estado,inicio,fin);
CREATE TABLE sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
