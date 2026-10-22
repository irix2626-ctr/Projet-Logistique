import { invoke } from '@tauri-apps/api/core';

/** Adaptateur de production : commandes Rust (rusqlite), transactions réelles via db_batch. */
export const tauriDb = {
  select: (sql, params) => invoke('db_select', { sql, params }),
  execute: async (sql, params) => ({ rowsAffected: await invoke('db_execute', { sql, params }) }),
  batch: (statements) => invoke('db_batch', { statements }),
};
