// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Coktuysse sebebi diske yaz: abort olsa bile hook calisir.
    std::panic::set_hook(Box::new(|info| {
        if let Ok(home) = std::env::var("USERPROFILE") {
            let path = std::path::PathBuf::from(home)
                .join(".config")
                .join("opencode")
                .join("smart-screen-crash.log");
            let _ = std::fs::write(path, format!("{info}\n"));
        }
    }));
    smart_screen_lib::run()
}
