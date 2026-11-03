// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! JSONC (yorumlu JSON) icin **cerrahi** anahtar oku/yaz.
//!
//! Neden `serde_json` ile parse + yeniden yazmiyoruz: VS Code `settings.json`
//! ve Windows Terminal `settings.json` yorum ve sonda virgul icerir. Parse edip
//! yeniden uretmek kullanicinin yorumlarini, girintisini ve anahtar sirasini
//! siler. Burada yalniz ilgili anahtarin **deger araligi** degisir; dosyanin
//! geri kalani bayt bayt ayni kalir.

// Bu modulun butun yuzeyi uygulama adaptorleri (A2) tarafindan kullanilacak;
// liste bos oldugu surece derleyici "kullanilmiyor" der, ki dogru.
#![allow(dead_code)]

/// Anahtar bulunduysa degeri kapsayan bayt araligi (`text[start..end]`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Span {
    start: usize,
    end: usize,
}

fn is_ws(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | b'\n' | b'\r')
}

/// `i` konumundan baslayarak bosluk ve yorumlari atlar; ilk anlamli baytin
/// indeksini dondurur (metin bittiyse uzunluk).
fn skip_ws_comments(text: &str, mut i: usize) -> usize {
    let b = text.as_bytes();
    loop {
        while i < b.len() && is_ws(b[i]) {
            i += 1;
        }
        if i + 1 < b.len() && b[i] == b'/' && b[i + 1] == b'/' {
            i += 2;
            while i < b.len() && b[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        if i + 1 < b.len() && b[i] == b'/' && b[i + 1] == b'*' {
            i += 2;
            while i + 1 < b.len() && !(b[i] == b'*' && b[i + 1] == b'/') {
                i += 1;
            }
            i = (i + 2).min(b.len());
            continue;
        }
        return i;
    }
}

/// `i` konumundaki `"` ile baslayan dizgenin **bir sonraki** baytini dondurur.
/// `\"` kacisi dogru atlanir; kapanmamis dizge metnin sonunda biter.
fn scan_string(b: &[u8], mut i: usize) -> usize {
    i += 1; // acilis tirnagi
    while i < b.len() {
        match b[i] {
            b'\\' => i = (i + 2).min(b.len()),
            b'"' => return i + 1,
            _ => i += 1,
        }
    }
    b.len()
}

/// `i` konumundaki bir degerin bittigi yer (ozel: obje/dizi icin dengeli tarama).
fn scan_value_end(b: &[u8], i: usize) -> usize {
    if i >= b.len() {
        return b.len();
    }
    match b[i] {
        b'"' => scan_string(b, i),
        b'{' | b'[' => scan_container(b, i),
        _ => {
            // Sayi / true / false / null: virgul, kapanis, bosluk ya da yorum basi.
            let mut j = i;
            while j < b.len() && !is_ws(b[j]) && !matches!(b[j], b',' | b'}' | b']' | b'/') {
                j += 1;
            }
            j
        }
    }
}

/// `i` konumundaki `{`/`[` ile baslayan kapsayicinin bittigi yer.
fn scan_container(b: &[u8], mut i: usize) -> usize {
    let mut depth = 0usize;
    while i < b.len() {
        match b[i] {
            b'"' => {
                i = scan_string(b, i);
                continue;
            }
            b'/' if i + 1 < b.len() && b[i + 1] == b'/' => {
                while i < b.len() && b[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            b'/' if i + 1 < b.len() && b[i + 1] == b'*' => {
                i += 2;
                while i + 1 < b.len() && !(b[i] == b'*' && b[i + 1] == b'/') {
                    i += 1;
                }
                i = (i + 2).min(b.len());
                continue;
            }
            b'{' | b'[' => {
                depth += 1;
                i += 1;
            }
            b'}' | b']' => {
                depth = depth.saturating_sub(1);
                i += 1;
                if depth == 0 {
                    return i;
                }
            }
            _ => i += 1,
        }
    }
    b.len()
}

/// Dosyadaki **obje anahtari** konumunda `key` arar. Deger icindeki ayni metin
/// eslesmez — `"theme": "theme"` gibi durumda yalniz anahtar bulunur.
///
/// Ic ice objeler de taranir: adaptorlerin cogu duz anahtar kullanir
/// (`window.autoDetectColorScheme`), ama kullanici dosyayi gruplayabilir.
fn find_value(text: &str, key: &str) -> Option<Span> {
    let b = text.as_bytes();
    // Her kapsayici icin (obje mu, sirada anahtar mi bekleniyor).
    let mut stack: Vec<(bool, bool)> = Vec::new();
    let mut i = 0usize;
    while i < b.len() {
        if b[i] == b'/' && i + 1 < b.len() && (b[i + 1] == b'/' || b[i + 1] == b'*') {
            i = skip_ws_comments(text, i);
            continue;
        }
        match b[i] {
            b'"' => {
                let end = scan_string(b, i);
                let expects_key = stack.last().map(|f| f.0 && f.1).unwrap_or(false);
                if expects_key {
                    if let Some(f) = stack.last_mut() {
                        f.1 = false;
                    }
                    let decoded = serde_json::from_str::<String>(&text[i..end]).ok();
                    if decoded.as_deref() == Some(key) {
                        let colon = skip_ws_comments(text, end);
                        if colon < b.len() && b[colon] == b':' {
                            let start = skip_ws_comments(text, colon + 1);
                            if start < b.len() {
                                return Some(Span {
                                    start,
                                    end: scan_value_end(b, start),
                                });
                            }
                        }
                    }
                }
                i = end;
            }
            b'{' => {
                stack.push((true, true));
                i += 1;
            }
            b'[' => {
                stack.push((false, false));
                i += 1;
            }
            b'}' | b']' => {
                stack.pop();
                i += 1;
            }
            b',' => {
                if let Some(f) = stack.last_mut() {
                    if f.0 {
                        f.1 = true;
                    }
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    None
}

/// Kok kapsayicinin (acilis, kapanis) indeksleri. Dosya bozuksa `None`.
fn root_bounds(text: &str) -> Option<(usize, usize)> {
    let b = text.as_bytes();
    let open = skip_ws_comments(text, 0);
    if open >= b.len() || (b[open] != b'{' && b[open] != b'[') {
        return None;
    }
    let mut depth = 0usize;
    let mut i = open;
    while i < b.len() {
        match b[i] {
            b'"' => {
                i = scan_string(b, i);
                continue;
            }
            b'/' if i + 1 < b.len() && (b[i + 1] == b'/' || b[i + 1] == b'*') => {
                i = skip_ws_comments(text, i);
                continue;
            }
            b'{' | b'[' => {
                depth += 1;
                i += 1;
            }
            b'}' | b']' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Some((open, i));
                }
                i += 1;
            }
            _ => i += 1,
        }
    }
    None
}

/// `[from, to)` araligindaki son anlamli (bosluk/yorum olmayan) baytin
/// indeksi ve kendisi. Yorumlar atlanir ki yorum icindeki `,` bizi yaniltmasin.
fn last_significant(text: &str, from: usize, to: usize) -> Option<(usize, u8)> {
    let b = text.as_bytes();
    let mut i = from;
    let mut last = None;
    while i < to {
        if b[i] == b'/' && i + 1 < to && (b[i + 1] == b'/' || b[i + 1] == b'*') {
            i = skip_ws_comments(text, i);
            continue;
        }
        if !is_ws(b[i]) {
            last = Some((i, b[i]));
        }
        i += 1;
    }
    last
}

/// Bir konumun bulundugu satirin bosluk oneki (satir basi ile konum arasi
/// tamamen bosluksa). Girintiyi uydurmak yerine komsudan kopyalariz.
fn line_indent(text: &str, idx: usize) -> String {
    let start = text[..idx].rfind('\n').map(|p| p + 1).unwrap_or(0);
    let prefix = &text[start..idx];
    if prefix.chars().all(|c| c == ' ' || c == '\t') {
        prefix.to_string()
    } else {
        String::new()
    }
}

/// Anahtar yoksa kok kapsayicinin sonuna ekler. Virgul yonetimi ve bos obje
/// durumu burada; yorumlar ve diger satirlar korunur.
fn insert_entry(text: &str, key: &str, literal: &str) -> String {
    let key_json = serde_json::Value::String(key.to_string()).to_string();
    let kv = format!("{key_json}: {literal}");

    let Some((open, close)) = root_bounds(text) else {
        // Kok obje yok (bos/bozuk dosya): sifirdan gecerli bir obje uret.
        return format!("{{\n  {kv}\n}}\n");
    };
    let open_indent = line_indent(text, open);

    let only_ws = skip_ws_comments(text, open + 1) == close;
    if only_ws {
        // Bos obje: acilis parantezinden hemen sonra ekle; icindeki yorumlar
        // (varsa) silinmesin diye araya girmiyoruz, sadece onune yaziyoruz.
        let mut out = String::with_capacity(text.len() + kv.len() + 8);
        out.push_str(&text[..open + 1]);
        out.push('\n');
        out.push_str(&open_indent);
        out.push_str("  ");
        out.push_str(&kv);
        out.push('\n');
        out.push_str(&open_indent);
        out.push_str(&text[open + 1..]);
        return out;
    }

    let (last_idx, last_ch) = match last_significant(text, open + 1, close) {
        Some(p) => p,
        None => (open, b'{'),
    };
    let trailing_comma = last_ch == b',';

    let close_line_start = text[..close].rfind('\n').map(|p| p + 1).unwrap_or(0);
    let close_own_line = close_line_start > last_idx
        && text[close_line_start..close]
            .chars()
            .all(|c| c == ' ' || c == '\t');

    if close_own_line {
        let indent = {
            let entry_indent = line_indent(text, last_idx);
            if entry_indent.is_empty() {
                format!("{open_indent}  ")
            } else {
                entry_indent
            }
        };
        let mut out = String::with_capacity(text.len() + kv.len() + 8);
        out.push_str(&text[..last_idx + 1]);
        if !trailing_comma {
            out.push(',');
        }
        // Iki nokta arasindaki bolge (yorum olabilir) atlanmaz, korunur.
        out.push_str(&text[last_idx + 1..close_line_start]);
        out.push_str(&indent);
        out.push_str(&kv);
        out.push('\n');
        out.push_str(&text[close_line_start..]);
        out
    } else {
        // Tek satirlik obje: araya sikistir.
        let mut out = String::with_capacity(text.len() + kv.len() + 4);
        out.push_str(&text[..last_idx + 1]);
        if !trailing_comma {
            out.push(',');
        }
        out.push(' ');
        out.push_str(&kv);
        out.push_str(&text[last_idx + 1..]);
        out
    }
}

/// Anahtarin dizge degerini okur (yoksa `None`).
pub fn get_string(text: &str, key: &str) -> Option<String> {
    let span = find_value(text, key)?;
    serde_json::from_str::<String>(&text[span.start..span.end]).ok()
}

/// Anahtarin boolean degerini okur (yoksa `None`).
pub fn get_bool(text: &str, key: &str) -> Option<bool> {
    let span = find_value(text, key)?;
    serde_json::from_str::<bool>(&text[span.start..span.end]).ok()
}

/// Dizge yazar. Deger zaten ayniysa metin **bayt bayt** ayni doner: ayni
/// degeri tekrar yazmak VS Code'u gereksiz yeniden yuklerdi.
pub fn set_string(text: &str, key: &str, value: &str) -> String {
    let literal = serde_json::Value::String(value.to_string()).to_string();
    match find_value(text, key) {
        Some(span) => {
            if let Ok(current) = serde_json::from_str::<String>(&text[span.start..span.end]) {
                if current == value {
                    return text.to_string();
                }
            }
            let mut out = String::with_capacity(text.len() + literal.len());
            out.push_str(&text[..span.start]);
            out.push_str(&literal);
            out.push_str(&text[span.end..]);
            out
        }
        None => insert_entry(text, key, &literal),
    }
}

/// Boolean yazar; ayni deger icin metin degismez (bkz. `set_string`).
pub fn set_bool(text: &str, key: &str, value: bool) -> String {
    let literal = if value { "true" } else { "false" };
    match find_value(text, key) {
        Some(span) => {
            let same = serde_json::from_str::<bool>(&text[span.start..span.end])
                .map(|v| v == value)
                .unwrap_or(false);
            if same {
                return text.to_string();
            }
            let mut out = String::with_capacity(text.len() + literal.len());
            out.push_str(&text[..span.start]);
            out.push_str(literal);
            out.push_str(&text[span.end..]);
            out
        }
        None => insert_entry(text, key, literal),
    }
}

/// Yorumlari boslukla degistirir: satir numaralari kaymaz, dizge icindeki
/// `//` bozulmaz. Dogrulama icin `serde_json` oncesi kullanilir.
pub fn strip_comments(text: &str) -> String {
    let b = text.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0usize;
    while i < b.len() {
        match b[i] {
            b'"' => {
                let end = scan_string(b, i);
                out.extend_from_slice(&b[i..end]);
                i = end;
            }
            b'/' if i + 1 < b.len() && b[i + 1] == b'/' => {
                while i < b.len() && b[i] != b'\n' {
                    out.push(b' ');
                    i += 1;
                }
            }
            b'/' if i + 1 < b.len() && b[i + 1] == b'*' => {
                out.extend_from_slice(b"  ");
                i += 2;
                while i < b.len() && !(b[i] == b'*' && i + 1 < b.len() && b[i + 1] == b'/') {
                    out.push(if b[i] == b'\n' { b'\n' } else { b' ' });
                    i += 1;
                }
                if i < b.len() {
                    out.extend_from_slice(b"  ");
                    i = (i + 2).min(b.len());
                }
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Yorumlar siyrildiktan sonra gecerli JSON mu?
///
/// Not: sonda virgul (`trailing comma`) JSONC'de serbesttir ama `serde_json`
/// reddeder. Cagiran, yazmadan once bu kontrolu "dosya bozuk mu" kapisi
/// olarak kullanacaksa sonda virgullu dosyalarda yanlis alarm verebilir.
pub fn is_valid(text: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(&strip_comments(text)).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    const COMMENTED: &str = r#"{
    // gorunum ayarlari
    "window.autoDetectColorScheme": false,
    "workbench.colorTheme": "Default Dark Modern", /* tercih */
    "editor.fontSize": 14,
}"#;

    #[test]
    fn reads_through_comments_and_trailing_comma() {
        assert_eq!(
            get_string(COMMENTED, "workbench.colorTheme").as_deref(),
            Some("Default Dark Modern")
        );
        assert_eq!(
            get_bool(COMMENTED, "window.autoDetectColorScheme"),
            Some(false)
        );
    }

    #[test]
    fn write_changes_only_value_bytes() {
        let out = set_string(COMMENTED, "workbench.colorTheme", "Default Light Modern");
        assert!(out.contains("// gorunum ayarlari"), "yorum korunmali");
        assert!(out.contains("/* tercih */"), "blok yorum korunmali");
        assert!(out.contains("\"editor.fontSize\": 14,"), "diger satir ayni");
        assert!(out.ends_with(",\n}"), "sonda virgul korunmali");
        let expected = COMMENTED.replace("Default Dark Modern", "Default Light Modern");
        assert_eq!(out, expected, "yalniz deger araligi degismeli");
    }

    #[test]
    fn bool_write_is_idempotent() {
        let once = set_bool(COMMENTED, "window.autoDetectColorScheme", true);
        let twice = set_bool(&once, "window.autoDetectColorScheme", true);
        assert_eq!(
            once, twice,
            "ayni deger iki kez yazilinca metin degismemeli"
        );
        assert!(once.contains("\"window.autoDetectColorScheme\": true,"));
    }

    #[test]
    fn string_write_is_idempotent() {
        let once = set_string(COMMENTED, "workbench.colorTheme", "X");
        let twice = set_string(&once, "workbench.colorTheme", "X");
        assert_eq!(once, twice);
    }

    #[test]
    fn inserts_missing_key_before_closing_brace() {
        let out = set_string(COMMENTED, "theme", "dark");
        assert!(
            out.contains("\"theme\": \"dark\""),
            "yeni anahtar yazilmali"
        );
        assert!(is_valid(&out), "govde gecerli kalmali: {out:?}");
        assert!(
            !out.contains("\"theme\": \"dark\","),
            "fazladan virgul olmamali"
        );
    }

    #[test]
    fn inserts_into_object_without_trailing_comma() {
        let src = "{\n  \"a\": 1\n}\n";
        let out = set_bool(src, "b", true);
        assert_eq!(out, "{\n  \"a\": 1,\n  \"b\": true\n}\n");
        assert!(is_valid(&out));
    }

    #[test]
    fn inserts_into_empty_object() {
        let out = set_string("{}", "theme", "light");
        assert_eq!(out, "{\n  \"theme\": \"light\"\n}");
        assert!(is_valid(&out));

        let out = set_string("{\n}\n", "theme", "light");
        assert!(is_valid(&out), "bos obje gecerli kalmali: {out:?}");
        assert_eq!(get_string(&out, "theme").as_deref(), Some("light"));
    }

    #[test]
    fn nested_object_keys_are_found() {
        let src = "{\n  \"editor\": {\n    \"theme\": \"dark\"\n  },\n  \"theme\": \"light\"\n}";
        assert_eq!(get_string(src, "theme").as_deref(), Some("dark"));
        let out = set_string(src, "theme", "light");
        assert!(out.contains("\"editor\": {\n    \"theme\": \"light\"\n  }"));
        assert!(
            out.contains("  \"theme\": \"light\""),
            "ust duzey ayni kalmali"
        );
    }

    #[test]
    fn escaped_quote_does_not_end_string() {
        let src = r#"{"a": "x\"y", "b": 1}"#;
        assert_eq!(get_string(src, "a").as_deref(), Some("x\"y"));
        let out = set_string(src, "a", "q\"r");
        assert_eq!(get_string(&out, "a").as_deref(), Some("q\"r"));
        assert!(
            out.ends_with(", \"b\": 1}"),
            "sonraki anahtar bozulmamali: {out}"
        );
    }

    #[test]
    fn key_text_inside_value_is_not_matched() {
        // Deger icinde "theme" gecse de anahtar olarak eslesmemeli.
        let src = r#"{"note": "theme: dark", "theme": "light"}"#;
        assert_eq!(get_string(src, "theme").as_deref(), Some("light"));
        let out = set_string(src, "theme", "dark");
        assert_eq!(out, r#"{"note": "theme: dark", "theme": "dark"}"#);
    }

    #[test]
    fn strip_comments_preserves_line_count_and_strings() {
        let src = "{\n  // yorum\n  \"a\": \"http://x//y\" /* blok */,\n  \"b\": 2\n}";
        let stripped = strip_comments(src);
        assert_eq!(
            stripped.lines().count(),
            src.lines().count(),
            "satir sayisi kaymamali"
        );
        assert!(
            stripped.contains("\"a\": \"http://x//y\""),
            "dizge icindeki // korunmali"
        );
        assert!(!stripped.contains("yorum"));
        assert!(serde_json::from_str::<serde_json::Value>(&stripped).is_ok());
    }

    #[test]
    fn validity_flags_broken_document() {
        // Sonda virgul JSONC'de serbest ama `serde_json` reddeder — `is_valid`
        // bilerek katidir (sozlesme C2), cagiran karari buna gore verir.
        assert!(!is_valid(COMMENTED), "sonda virgul katı JSON'da gecersiz");
        assert!(is_valid("{\n  // yorum\n  \"a\": 1\n}\n"));
        assert!(!is_valid(r#"{"a": }"#));
    }

    #[test]
    fn missing_key_reads_as_none() {
        assert_eq!(get_string(COMMENTED, "yok"), None);
        assert_eq!(get_bool(COMMENTED, "yok"), None);
    }

    #[test]
    fn non_string_value_is_not_returned_as_string() {
        let src = r#"{"theme": {"name": "x"}}"#;
        assert_eq!(get_string(src, "theme"), None);
        // Yazma yine de cerrahi olmali: yalniz obje araligi degisir.
        let out = set_string(src, "theme", "dark");
        assert_eq!(out, r#"{"theme": "dark"}"#);
    }
}
