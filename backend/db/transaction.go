package db

import "database/sql"

type QuerierTx struct {
	*Queries
	tx *sql.Tx
}

// Rollback aborts the transaction.
func (q *QuerierTx) Rollback() error {
	return q.tx.Rollback()
}

// Commit commits the transaction.
func (q *QuerierTx) Commit() error {
	return q.tx.Commit()
}

// NewTx creates a new transaction querier.
func NewTx(tx *sql.Tx) *QuerierTx {
	return &QuerierTx{
		New(tx),
		tx,
	}
}
