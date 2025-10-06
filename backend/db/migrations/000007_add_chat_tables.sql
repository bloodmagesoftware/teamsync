-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('dm', 'group')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name TEXT,
    last_message_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE conversation_participants (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);

CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    edited_at DATETIME,
    deleted_at DATETIME,
    content_type TEXT NOT NULL DEFAULT 'text/plain',
    body TEXT NOT NULL,
    reply_to_id INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
    UNIQUE (conversation_id, seq)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, seq DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);

CREATE TABLE message_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    attachment_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_message_attachments_message ON message_attachments(message_id);

CREATE TABLE conversation_read_state (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_read_seq INTEGER NOT NULL DEFAULT 0,
    last_read_at DATETIME,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversation_read_state_user ON conversation_read_state(user_id);
