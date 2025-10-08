-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    profile_image_hash TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Invitation codes table
CREATE TABLE invitation_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users(id),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- OAuth tokens table
CREATE TABLE oauth_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    access_token TEXT NOT NULL UNIQUE,
    refresh_token TEXT NOT NULL UNIQUE,
    access_token_expires_at DATETIME NOT NULL,
    refresh_token_expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_oauth_tokens_access_token ON oauth_tokens(access_token);
CREATE INDEX idx_oauth_tokens_user_id ON oauth_tokens(user_id);

-- User settings table
CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY,
    enter_sends_message BOOLEAN NOT NULL DEFAULT 0,
    markdown_enabled BOOLEAN NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Conversations table
CREATE TABLE conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('dm', 'group')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    name TEXT,
    last_message_seq INTEGER NOT NULL DEFAULT 0
);

-- Conversation participants table
CREATE TABLE conversation_participants (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (conversation_id, user_id),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);

-- Messages table
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
    encrypted_body TEXT,
    is_encrypted BOOLEAN NOT NULL DEFAULT 0,
    reply_to_id INTEGER,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reply_to_id) REFERENCES messages(id) ON DELETE SET NULL,
    UNIQUE (conversation_id, seq)
);

CREATE INDEX idx_messages_conversation ON messages(conversation_id, seq DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_encrypted ON messages(is_encrypted);

-- Message attachments table
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

-- Conversation read state table
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

-- Calls table
CREATE TABLE calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    message_id INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    deleted_at DATETIME,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX idx_calls_conversation ON calls(conversation_id);
CREATE INDEX idx_calls_message ON calls(message_id);
