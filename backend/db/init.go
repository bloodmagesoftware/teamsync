// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

var globalDB *sql.DB

func Init(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("failed to enable WAL mode: %w", err)
	}

	if err := runMigrations(db); err != nil {
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	globalDB = db
	return db, nil
}

func Close() error {
	if globalDB != nil {
		return globalDB.Close()
	}
	return nil
}

func Get() *sql.DB {
	return globalDB
}
