-- Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

ALTER TABLE users ADD COLUMN profile_image BLOB;
ALTER TABLE users ADD COLUMN profile_image_hash TEXT;
