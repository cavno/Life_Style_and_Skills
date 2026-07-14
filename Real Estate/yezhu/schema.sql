-- 业主之家 D1 表结构。在 Cloudflare 控制台 D1 的「Console」里整段粘贴执行，或用 wrangler d1 execute 运行。
CREATE TABLE IF NOT EXISTS config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  communityName TEXT, streetOffice TEXT, community TEXT,
  totalHouseholds INTEGER DEFAULT 0, totalArea REAL DEFAULT 0,
  thresholdPct REAL DEFAULT 0.2, headcountLabel TEXT DEFAULT '业主总人数',
  lianmingMatter TEXT, currentStage TEXT DEFAULT 'collecting',
  initiatorName TEXT, initiatorPhone TEXT, noticeText TEXT,
  adminHash TEXT, secret TEXT
);
CREATE TABLE IF NOT EXISTS signatures (
  id TEXT PRIMARY KEY,
  editToken TEXT,
  name TEXT, building TEXT, unit TEXT, room TEXT, roomFull TEXT,
  phone TEXT, area REAL, certNo TEXT,
  certKey TEXT, idKey TEXT, signKey TEXT,
  status TEXT DEFAULT 'pending', reviewNote TEXT, reviewedAt INTEGER,
  submittedAt INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sig_status ON signatures(status);
CREATE INDEX IF NOT EXISTS idx_sig_room   ON signatures(roomFull);
CREATE INDEX IF NOT EXISTS idx_sig_edit   ON signatures(editToken);
