//! Base locale SQLite (rusqlite). Trois commandes seulement :
//! - db_select  : lecture ;
//! - db_execute : écriture unitaire ;
//! - db_batch   : plusieurs instructions dans UNE transaction (tout ou rien). C'est ce qui garantit
//!   qu'une donnée métier et son opération de synchronisation sont toujours écrites ensemble.

use rusqlite::{params_from_iter, types::Value as SqlValue, types::ValueRef, Connection};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::{path::Path, sync::Mutex};
use tauri::State;

pub struct Db(pub Mutex<Connection>);

/// Migrations embarquées dans l'application : le même SQL est chargé par les tests Node.
const MIGRATIONS: &[(&str, &str)] = &[("0001_init", include_str!("../migrations/0001_init.sql"))];

pub fn open(path: &Path) -> Result<Connection, rusqlite::Error> {
    let mut conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    for (version, sql) in MIGRATIONS {
        let done: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            rusqlite::params![version],
            |row| row.get(0),
        )?;
        if !done {
            let tx = conn.transaction()?;
            tx.execute_batch(sql)?;
            tx.execute(
                "INSERT INTO schema_migrations (version) VALUES (?1)",
                rusqlite::params![version],
            )?;
            tx.commit()?;
        }
    }
    Ok(conn)
}

#[derive(Deserialize)]
pub struct Stmt {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}

fn to_sql_values(params: &[Value]) -> Result<Vec<SqlValue>, String> {
    params
        .iter()
        .map(|v| match v {
            Value::Null => Ok(SqlValue::Null),
            Value::Bool(b) => Ok(SqlValue::Integer(*b as i64)),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    Ok(SqlValue::Integer(i))
                } else if let Some(f) = n.as_f64() {
                    Ok(SqlValue::Real(f))
                } else {
                    Err("nombre invalide".to_string())
                }
            }
            Value::String(s) => Ok(SqlValue::Text(s.clone())),
            _ => Err("type de paramètre non supporté".to_string()),
        })
        .collect()
}

fn value_to_json(v: ValueRef) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => serde_json::Number::from_f64(f)
            .map(Value::Number)
            .unwrap_or(Value::Null),
        ValueRef::Text(t) => Value::String(String::from_utf8_lossy(t).into_owned()),
        ValueRef::Blob(_) => Value::Null,
    }
}

#[tauri::command(async)]
pub fn db_select(
    db: State<'_, Db>,
    sql: String,
    params: Vec<Value>,
) -> Result<Vec<Map<String, Value>>, String> {
    let conn = db.0.lock().map_err(|_| "base verrouillée".to_string())?;
    let mut stmt = conn.prepare(&sql).map_err(|e| format!("{e} (requête : {sql})"))?;
    let names: Vec<String> = stmt.column_names().into_iter().map(|s| s.to_string()).collect();
    let bound = to_sql_values(&params)?;

    let rows = stmt
        .query_map(params_from_iter(bound.iter()), |row| {
            let mut map = Map::new();
            for (i, name) in names.iter().enumerate() {
                map.insert(name.clone(), value_to_json(row.get_ref(i)?));
            }
            Ok(map)
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn db_execute(db: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<usize, String> {
    let conn = db.0.lock().map_err(|_| "base verrouillée".to_string())?;
    let bound = to_sql_values(&params)?;
    conn.execute(&sql, params_from_iter(bound.iter()))
        .map_err(|e| format!("{e} (requête : {sql})"))
}

/// Exécute toutes les instructions dans une seule transaction ; renvoie le nombre de lignes touchées par chacune.
/// À la moindre erreur, rien n'est écrit.
#[tauri::command(async)]
pub fn db_batch(db: State<'_, Db>, statements: Vec<Stmt>) -> Result<Vec<usize>, String> {
    let mut conn = db.0.lock().map_err(|_| "base verrouillée".to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut counts = Vec::with_capacity(statements.len());

    for s in &statements {
        let bound = to_sql_values(&s.params)?;
        let n = tx
            .execute(&s.sql, params_from_iter(bound.iter()))
            .map_err(|e| format!("{e} (requête : {})", s.sql))?;
        counts.push(n);
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(counts)
}
