mod db;
mod secret;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // La base vit dans le dossier de données de l'application (ex. %APPDATA%\ci.logistique.tracabilite).
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("logistique.db")).map_err(|e| e.to_string())?;
            app.manage(db::Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_select,
            db::db_execute,
            db::db_batch,
            secret::secret_set,
            secret::secret_get,
            secret::secret_delete
        ])
        .run(tauri::generate_context!())
        .expect("erreur au lancement de l'application");
}
