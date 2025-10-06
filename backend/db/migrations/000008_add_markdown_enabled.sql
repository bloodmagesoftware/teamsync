-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

ALTER TABLE user_settings ADD COLUMN markdown_enabled BOOLEAN NOT NULL DEFAULT 1;
