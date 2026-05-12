-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  agents TEXT NOT NULL DEFAULT '{}'  -- JSON string
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  agent_id TEXT,
  agent_name TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  is_answer INTEGER NOT NULL DEFAULT 0,
  feedback TEXT,  -- JSON string
  message_files TEXT NOT NULL DEFAULT '[]',  -- JSON string
  agent_thoughts TEXT NOT NULL DEFAULT '[]',  -- JSON string
  created_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
