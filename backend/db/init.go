// Copyright (C) 2025  Mayer & Ott GbR AGPL v3 (license file is attached)

package db

import (
	"database/sql"
	"errors"
	"fmt"

	_ "modernc.org/sqlite"
)

func Init(dbPath string) (*Queries, error) {
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

	return New(db), nil
}

// Close closes the querier.
func (q *Queries) Close() error {
	if q.db == nil {
		return nil
	}
	switch db := q.db.(type) {
	case *sql.DB:
		return db.Close()
	case *sql.Tx:
		return db.Rollback()
	default:
		return fmt.Errorf("unexpected type %T for querier db", q.db)
	}
}

// Begin starts a transaction.
func (q *Queries) Begin() (*QuerierTx, error) {
	if q.db == nil {
		return nil, errors.New("db is nil")
	}
	if db, ok := q.db.(*sql.DB); ok {
		sqlTx, err := db.Begin()
		if err != nil {
			return nil, fmt.Errorf("failed to begin transaction: %w", err)
		}
		return NewTx(sqlTx), nil
	} else {
		return nil, fmt.Errorf("unexpected type %T for querier db", q.db)
	}
}
