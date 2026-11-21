use serde_json::{Value, json};

fn safe_key(key: &str) -> bool {
    !key.is_empty() && !matches!(key, "__proto__" | "constructor" | "prototype")
        && !key.chars().any(char::is_control)
}

fn field_value(field: &str, text: &str) -> Value {
    match field {
        "constant" | "disable" | "selective" | "excludeRecursion" | "preventRecursion"
        | "delayUntilRecursion" | "useProbability" => json!(matches!(text, "1" | "true")),
        "key" | "keys" | "keysecondary" | "secondary_keys" => {
            json!(text.split(',').map(str::trim).filter(|part| !part.is_empty()).collect::<Vec<_>>())
        }
        "position" | "order" | "depth" | "role" | "selectiveLogic" | "probability" => {
            text.parse::<i64>().map_or_else(|_| json!(text), |number| json!(number))
        }
        _ => json!(text),
    }
}

pub fn apply(input: &Value) -> Result<Value, &'static str> {
    let action = input["action"].as_str().unwrap_or_default();
    let mut book = input["book"].clone();
    if action == "replace" {
        book = input["data"].clone();
        if !book.is_object() || !book["entries"].is_object() {
            return Err("世界书必须包含 entries 对象");
        }
        return Ok(json!({"book": book, "pipe": ""}));
    }
    let entries = book.get_mut("entries").and_then(Value::as_object_mut).ok_or("没有找到世界书或条目表无效")?;
    let mut pipe = String::new();
    match action {
        "create-entry" => {
            let uid = entries.keys().filter_map(|key| key.parse::<u32>().ok()).max()
                .map_or(Some(0), |max| max.checked_add(1)).ok_or("世界书条目 ID 已用完")?;
            let key = input["key"].as_str().unwrap_or_default();
            let content = input["text"].as_str().unwrap_or_default();
            entries.insert(uid.to_string(), json!({"uid": uid, "key": field_value("key", key),
                "keysecondary": [], "comment": key, "content": content, "order": 100,
                "position": 0, "depth": 4, "constant": false, "disable": false}));
            pipe = uid.to_string();
        }
        "set-field" | "get-field" => {
            let uid = input["uid"].as_str().ok_or("缺少世界书条目 ID")?;
            let field = input["field"].as_str().filter(|field| safe_key(field) && *field != "uid")
                .ok_or("世界书条目字段无效")?;
            let entry = entries.get_mut(uid).and_then(Value::as_object_mut).ok_or("世界书条目不存在")?;
            if action == "set-field" {
                let value = field_value(field, input["text"].as_str().unwrap_or_default());
                let alias = match field {
                    "key" => Some("keys"),
                    "keysecondary" => Some("secondary_keys"),
                    "order" => Some("insertion_order"),
                    _ => None,
                };
                if let Some(alias) = alias.filter(|alias| entry.contains_key(*alias)) {
                    entry.insert(alias.into(), value.clone());
                }
                if field == "disable" && entry.contains_key("enabled") {
                    entry.insert("enabled".into(), json!(value.as_bool() != Some(true)));
                }
                if field == "depth" || field == "position" {
                    if let Some(extensions) = entry.get_mut("extensions").and_then(Value::as_object_mut) {
                        extensions.insert(field.into(), value.clone());
                    }
                }
                entry.insert(field.to_owned(), value);
            } else if let Some(value) = entry.get(field) {
                pipe = value.as_str().map(str::to_owned).unwrap_or_else(|| value.to_string());
            }
        }
        _ => return Err("世界书操作暂不支持"),
    }
    Ok(json!({"book": book, "pipe": pipe}))
}
