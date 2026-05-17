// Windows release build'inde ekstra konsol penceresi açılmasın.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    caya_desktop_pet_lib::run()
}
