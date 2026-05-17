# Icons

Tauri bundler bu klasörde aşağıdaki dosyaları bekler:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.ico` (Windows)
- `icon.icns` (macOS — opsiyonel)

## Hızlı oluşturma

Tauri CLI ile tek bir kaynak PNG'den tüm boyutları üretebilirsiniz:

```bash
npm run tauri icon path/to/source-1024.png
```

Yukarıdaki komut bu klasöre tüm gerekli boyutları otomatik yazar.

## Geçici kullanım

`tauri dev` sırasında bu ikonlar **gerekli değildir**.
Sadece `tauri build` (üretim bundle'ı) için zorunludur.
