# Backup and restore

`pnpm db:backup` creates a timestamped PostgreSQL custom-format dump under ignored `.local/backups` using migration-owner credentials. It never prints connection passwords. Protect backups as sensitive data. Encrypted MFA/outbox data also requires the separate DATA_KEY; a database dump alone cannot recover it.

`pnpm db:restore:test` reads the latest recorded dump and creates a NEW `larosentry_restore_test_<timestamp>` database. It uses no `--clean`, no drop, and no existing database target. It restores schema, constraints, permissions and records, then counts facilities. An optional file path selects a different dump. Native restore currently uses the locally provisioned PostgreSQL operator credential.

Before deployment, define retention, encrypted off-device backups, key recovery, least-privilege backup identities, restoration exercises and measured recovery objectives. There is no scheduled backup service in this pilot. A test restore validates a local restore only, not disaster recovery for an unbuilt production system.
