-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

CREATE TABLE user_settings (
    user_id INTEGER PRIMARY KEY,
    enter_sends_message BOOLEAN NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
