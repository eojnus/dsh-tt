use serde_json::{Value, json};
use std::collections::BTreeMap;

fn command(raw: &str, mut tokens: Vec<String>) -> Value {
    if tokens.is_empty() { return Value::Null; }
    let name = tokens.remove(0).trim_start_matches('/').to_ascii_lowercase();
    let mut named = BTreeMap::new();
    let mut unnamed = Vec::new();
    for token in tokens {
        if let Some((key, value)) = token.split_once('=')
            && !key.is_empty() && key.bytes().all(|ch| ch.is_ascii_alphanumeric() || b"_-".contains(&ch))
        {
            named.insert(key.to_owned(), value.to_owned());
        } else {
            unnamed.push(token);
        }
    }
    json!({"name": name, "raw": raw.trim(), "named": named, "unnamed": unnamed})
}

pub fn parse(text: &str) -> Result<Value, &'static str> {
    let mut quote = None;
    let mut token = String::new();
    let mut started = false;
    let mut start = 0;
    let mut tokens = Vec::new();
    let mut commands = Vec::new();
    let mut chars = text.char_indices().peekable();
    while let Some((offset, ch)) = chars.next() {
        if ch == '\\' && chars.peek().is_some_and(|&(_, next)| matches!(next, '\\' | '\'' | '"' | '|')) {
            let (_, literal) = chars.next().ok_or("斜杠命令转义未完成")?;
            token.push(literal);
            started = true;
        } else if let Some(delimiter) = quote {
            if ch == delimiter { quote = None; } else { token.push(ch); }
        } else if matches!(ch, '\'' | '"') && (!started || token.ends_with('=')) {
            quote = Some(ch);
            started = true;
        } else if ch.is_whitespace() || ch == '|' {
            if started {
                tokens.push(std::mem::take(&mut token));
                started = false;
            }
            if ch == '|' {
                let parsed = command(&text[start..offset], std::mem::take(&mut tokens));
                if !parsed.is_null() { commands.push(parsed); }
                start = offset + 1;
            }
        } else {
            token.push(ch);
            started = true;
        }
    }
    if quote.is_some() { return Err("斜杠命令中有未闭合的引号"); }
    if started { tokens.push(token); }
    let last = command(&text[start..], tokens);
    if !last.is_null() { commands.push(last); }
    Ok(json!({"commands": commands}))
}
