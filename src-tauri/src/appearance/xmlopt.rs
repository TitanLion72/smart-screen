// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 TitanLion72
//! Dar kapsamli XML "option" duzenleyici: JSONC modulunun XML karsiligi.
//!
//! Neden tam parser degil: JetBrains `laf.xml` icinde bizim degistirdigimiz tek
//! sey `<option name="theme" value="..."/>` degeri. Dosyanin geri kalani bayt
//! bayt korunmali. Bir DOM kutuphanesi eklemek hem yeni bagimlilik hem de
//! kullanicinin dosyasini yeniden bicimlendirme riski olurdu.

/// `start` konumundaki `<` ile baslayan etiketin bittigi `>` baytinin indeksi.
///
/// Tirnak icindeki `>` etiketi bitirmez (`value="a>b"`); `\"` kacisi da
/// tirnagi kapatmaz, cunku bazilari dosyayi elle duzenlerken boyle yazar.
fn scan_tag(b: &[u8], start: usize) -> Option<usize> {
    if b.get(start) != Some(&b'<') {
        return None;
    }
    let mut i = start + 1;
    let mut quote: Option<u8> = None;
    while i < b.len() {
        let c = b[i];
        match quote {
            Some(q) => {
                if c == b'\\' {
                    i += 2;
                    continue;
                }
                if c == q {
                    quote = None;
                }
            }
            None => {
                if c == b'"' || c == b'\'' {
                    quote = Some(c);
                } else if c == b'>' {
                    return Some(i);
                }
            }
        }
        i += 1;
    }
    None
}

/// Etiket metni icindeki `attr="deger"` ciftinin **deger araligi**
/// (etiket basina gore, tirnaklar disarida).
///
/// `&quot;` gibi XML varliklari ham tirnak icermedigi icin ek is gormez;
/// yalniz `\"` kacisi ayrica atlanir.
fn attr_span(tag: &str, attr: &str) -> Option<(usize, usize)> {
    let b = tag.as_bytes();
    let mut i = 1;
    // Etiket adi (`option`, `component` ...).
    while i < b.len() && !b[i].is_ascii_whitespace() && b[i] != b'/' && b[i] != b'>' {
        i += 1;
    }
    while i < b.len() {
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= b.len() || b[i] == b'/' || b[i] == b'>' {
            break;
        }
        let name_start = i;
        while i < b.len()
            && !b[i].is_ascii_whitespace()
            && b[i] != b'='
            && b[i] != b'/'
            && b[i] != b'>'
        {
            i += 1;
        }
        let name = &tag[name_start..i];
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        if i >= b.len() || b[i] != b'=' {
            // Deger tasimayan nitelik: sonraki nitelige gec.
            continue;
        }
        i += 1;
        while i < b.len() && b[i].is_ascii_whitespace() {
            i += 1;
        }
        let Some(&q) = b.get(i) else { break };
        if q != b'"' && q != b'\'' {
            break;
        }
        i += 1;
        let value_start = i;
        while i < b.len() && b[i] != q {
            if b[i] == b'\\' {
                i += 1;
            }
            i += 1;
        }
        let value_end = i.min(b.len());
        if name == attr {
            return Some((value_start, value_end));
        }
        i = (i + 1).min(b.len());
    }
    None
}

/// `name` niteligi `component` olan `<component ...>` blogunun **icerik**
/// araligi. Kendinden kapanan (`<component ... />`) blok degildir: tema
/// tasiyamaz, `None` dogru cevaptir.
fn find_component(text: &str, component: &str) -> Option<(usize, usize)> {
    let b = text.as_bytes();
    let mut i = 0;
    while i < b.len() {
        let rel = text[i..].find("<component")?;
        let start = i + rel;
        let after = start + "<component".len();
        // `<components>` gibi baska bir etiketi `component` sanmayalim.
        if after < b.len()
            && (b[after].is_ascii_alphanumeric() || b[after] == b'_' || b[after] == b'-')
        {
            i = after;
            continue;
        }
        let end = scan_tag(b, start)?;
        let tag = &text[start..=end];
        let same = attr_span(tag, "name").map(|(s, e)| &tag[s..e]) == Some(component);
        if same && !tag[..tag.len() - 1].trim_end().ends_with('/') {
            let body_start = end + 1;
            let rel_close = text[body_start..].find("</component>")?;
            return Some((body_start, body_start + rel_close));
        }
        i = end + 1;
    }
    None
}

/// Bir blok icindeki `name` niteligi `option` olan `<option>` etiketinin
/// `value` **deger araligi** (mutlak konum).
fn find_option_value(text: &str, from: usize, to: usize, option: &str) -> Option<(usize, usize)> {
    let b = text.as_bytes();
    let mut i = from;
    while i < to {
        let rel = text[i..to].find("<option")?;
        let start = i + rel;
        let after = start + "<option".len();
        if after < b.len()
            && (b[after].is_ascii_alphanumeric() || b[after] == b'_' || b[after] == b'-')
        {
            i = after;
            continue;
        }
        let end = scan_tag(b, start)?;
        if end >= to {
            // Etiket blok disina tasiyor: blok bozuk, yazmayalim.
            return None;
        }
        let tag = &text[start..=end];
        let same = attr_span(tag, "name").map(|(s, e)| &tag[s..e]) == Some(option);
        if same {
            if let Some((vs, ve)) = attr_span(tag, "value") {
                return Some((start + vs, start + ve));
            }
        }
        i = end + 1;
    }
    None
}

/// `<component name="component">` blogundaki `<option name="option" value="...">`
/// degerini okur. Blok/oge yoksa `None` — "ayar bu surumde tanimli degil".
pub fn get_attr(text: &str, component: &str, option: &str) -> Option<String> {
    let (from, to) = find_component(text, component)?;
    let (vs, ve) = find_option_value(text, from, to, option)?;
    Some(text[vs..ve].to_string())
}

/// Ayni ogenin **yalniz** `value="..."` kismini degistirir.
///
/// Blogun kalanina dokunulmaz; oge/blok yoksa `None` doner ve cagiran taraf
/// dosyayi hic yazmaz (olmayan ayari uydurmak IDE'yi sasirtirdi).
pub fn set_attr(text: &str, component: &str, option: &str, value: &str) -> Option<String> {
    let (from, to) = find_component(text, component)?;
    let (vs, ve) = find_option_value(text, from, to, option)?;
    if &text[vs..ve] == value {
        return Some(text.to_string());
    }
    let mut out = String::with_capacity(text.len() + value.len());
    out.push_str(&text[..vs]);
    out.push_str(value);
    out.push_str(&text[ve..]);
    Some(out)
}

/// `<!DOCTYPE ...>` gibi bildirimlerdeki `[ ... ]` blogunu da atlayarak
/// bildirimin bittigi `>` indeksini dondurur.
fn skip_declaration(b: &[u8], start: usize) -> Option<usize> {
    let mut depth = 0i32;
    let mut i = start + 2;
    while i < b.len() {
        match b[i] {
            b'[' => depth += 1,
            b']' => depth -= 1,
            b'>' if depth <= 0 => return Some(i),
            _ => {}
        }
        i += 1;
    }
    None
}

/// Basit denge denetimi: acilan her etiket dogru sirayla kapanmali.
///
/// Tam XML dogrulayici degil; amac **yazmadan once** dosyanin bozuk olup
/// olmadigini gormek. Yorum, CDATA, `<?xml?>` ve `<!DOCTYPE>` etiket sayilmaz.
pub fn is_well_formed(text: &str) -> bool {
    let b = text.as_bytes();
    let mut stack: Vec<String> = Vec::new();
    let mut i = 0usize;
    while i < b.len() {
        if b[i] != b'<' {
            i += 1;
            continue;
        }
        if text[i..].starts_with("<!--") {
            let Some(rel) = text[i + 4..].find("-->") else {
                return false;
            };
            i += 4 + rel + 3;
            continue;
        }
        if text[i..].starts_with("<![CDATA[") {
            let Some(rel) = text[i + 9..].find("]]>") else {
                return false;
            };
            i += 9 + rel + 3;
            continue;
        }
        if text[i..].starts_with("<?") {
            let Some(rel) = text[i + 2..].find("?>") else {
                return false;
            };
            i += 2 + rel + 2;
            continue;
        }
        if text[i..].starts_with("<!") {
            let Some(end) = skip_declaration(b, i) else {
                return false;
            };
            i = end + 1;
            continue;
        }
        let Some(end) = scan_tag(b, i) else {
            return false;
        };
        let inner = &text[i + 1..end];
        if let Some(rest) = inner.strip_prefix('/') {
            let name = rest.trim();
            match stack.pop() {
                Some(top) if top == name => {}
                _ => return false,
            }
        } else {
            let self_closing = inner.trim_end().ends_with('/');
            if !self_closing {
                let name = inner.split_whitespace().next().unwrap_or("");
                let name = name.trim_end_matches('/');
                if name.is_empty() {
                    return false;
                }
                stack.push(name.to_string());
            }
        }
        i = end + 1;
    }
    stack.is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;

    const LAF: &str = "<application>\n  <component name=\"LafManager\">\n    \
<option name=\"theme\" value=\"Dark\" />\n  </component>\n  <component name=\"Other\">\n    \
<option name=\"theme\" value=\"Dark\" />\n  </component>\n</application>\n";

    #[test]
    fn reads_value_from_the_right_component_only() {
        assert_eq!(
            get_attr(LAF, "LafManager", "theme").as_deref(),
            Some("Dark")
        );
        // `Other` blogundaki ayni oge okunmaz: kapsam onemli.
        assert_eq!(get_attr(LAF, "Baska", "theme"), None);
    }

    #[test]
    fn accepts_both_trailing_slash_and_plain_gt_forms() {
        let slash = "<a><component name=\"X\"><option name=\"o\" value=\"A\"/></component></a>";
        let plain =
            "<a><component name=\"X\"><option name=\"o\" value=\"B\"></option></component></a>";
        assert_eq!(get_attr(slash, "X", "o").as_deref(), Some("A"));
        assert_eq!(get_attr(plain, "X", "o").as_deref(), Some("B"));
    }

    #[test]
    fn escaped_quote_does_not_end_the_value() {
        let src = r#"<a><component name="X"><option name="o" value="a\"b" /></component></a>"#;
        assert_eq!(get_attr(src, "X", "o").as_deref(), Some(r#"a\"b"#));
    }

    #[test]
    fn write_changes_only_the_value_bytes() {
        let out = match set_attr(LAF, "LafManager", "theme", "Light") {
            Some(o) => o,
            None => panic!("yazma bekleniyordu"),
        };
        let expected = LAF.replacen("value=\"Dark\"", "value=\"Light\"", 1);
        assert_eq!(out, expected, "yalniz value araligi degismeli");
        assert_eq!(
            out.matches("value=\"Dark\"").count(),
            1,
            "diger bilesenin degeri ayni kalmali"
        );
        assert!(is_well_formed(&out));
    }

    #[test]
    fn write_is_idempotent() {
        let once = match set_attr(LAF, "LafManager", "theme", "Light") {
            Some(o) => o,
            None => panic!("yazma bekleniyordu"),
        };
        let twice = match set_attr(&once, "LafManager", "theme", "Light") {
            Some(o) => o,
            None => panic!("ikinci yazma bekleniyordu"),
        };
        assert_eq!(once, twice, "ayni deger metni degistirmemeli");
    }

    #[test]
    fn missing_component_or_option_returns_none() {
        assert_eq!(set_attr(LAF, "Yok", "theme", "Light"), None);
        assert_eq!(set_attr(LAF, "LafManager", "yok", "Light"), None);
        // Kendinden kapanan bilesen tema tasimaz.
        assert_eq!(
            set_attr("<a><component name=\"X\" /></a>", "X", "theme", "Light"),
            None
        );
        assert_eq!(get_attr(LAF, "LafManager", "fontSize"), None);
    }

    #[test]
    fn well_formed_rejects_unbalanced_and_accepts_comments() {
        assert!(is_well_formed(LAF));
        assert!(is_well_formed(
            "<?xml version=\"1.0\"?>\n<!DOCTYPE a>\n<!-- yorum -->\n<a><b x=\"1\"/>\
<![CDATA[ x < y ]]></a>"
        ));
        assert!(!is_well_formed("<a><b></a></b>"), "sira bozuk");
        assert!(!is_well_formed("<a><b>"), "kapanmayan etiket");
        assert!(!is_well_formed("</a>"), "fazla kapanis");
        assert!(!is_well_formed("<a><!-- kapanmamis"), "yorum bitmemis");
    }
}
