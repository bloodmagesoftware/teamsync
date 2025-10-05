ALTER TABLE invitation_codes ADD COLUMN created_by INTEGER REFERENCES users(id);
