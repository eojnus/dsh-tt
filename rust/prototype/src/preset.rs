use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};

pub const BUILTINS: &[&str] = &[
    "worldInfoBefore", "main", "worldInfoAfter", "charDescription", "charPersonality",
    "scenario", "personaDescription", "nsfw", "jailbreak",
];

pub fn is_marker(id: &str) -> bool {
    BUILTINS.contains(&id) || matches!(id, "chatHistory" | "enhanceDefinitions")
}

pub fn enabled(value: &Value) -> bool {
    value["enabled"].as_bool() != Some(false)
}

pub fn role(value: &Value) -> &'static str {
    match value.as_str() {
        Some("user") => "user",
        Some("assistant") => "assistant",
        _ => "system",
    }
}

pub fn number(value: &Value) -> Option<f64> {
    match value {
        Value::Number(number) => number.as_f64(),
        Value::String(text) => {
            let text = text.trim();
            if text.is_empty() { return Some(0.0); }
            let integer = [("0x", 16), ("0o", 8), ("0b", 2)].into_iter().find_map(|(prefix, radix)| {
                text.get(..2).filter(|part| part.eq_ignore_ascii_case(prefix))?;
                u64::from_str_radix(&text[2..], radix).ok()
            });
            integer.map(|value| value as f64).or_else(|| text.parse::<f64>().ok())
        }
        Value::Bool(enabled) => Some(u8::from(*enabled).into()),
        Value::Null => Some(0.0),
        Value::Array(values) if values.is_empty() => Some(0.0),
        Value::Array(values) if values.len() == 1 && !values[0].is_boolean() => number(&values[0]),
        _ => None,
    }.filter(|value| value.is_finite())
}

pub fn at_depth(prompt: &Value) -> bool {
    number(&prompt["injection_position"]) == Some(1.0)
}

fn identifier(row: &Value) -> Option<&str> {
    row["identifier"].as_str()
}

fn list(value: &Value) -> &[Value] {
    value.as_array().map_or(&[], Vec::as_slice)
}

pub fn normalize(input: &Value) -> Value {
    let name = ["name", "preset_name"].iter().find_map(|key| input[key].as_str().filter(|name| !name.is_empty()))
        .unwrap_or("导入的预设");
    let prompts: Vec<_> = list(&input["prompts"]).iter().filter(|row| identifier(row).is_some()).collect();
    let order = match input["order"].as_array() {
        Some(slots) => slots.iter().filter(|row| identifier(row).is_some()).cloned().collect(),
        None => prompts.iter().map(|row| json!({"identifier": row["identifier"], "enabled": true})).collect::<Vec<_>>(),
    };
    json!({"name": name, "prompts": prompts, "order": order})
}

struct Change<'a> {
    enabled: Option<bool>,
    content: Option<&'a str>,
}

fn decode_change(value: &Value) -> Change<'_> {
    Change {
        enabled: value.as_bool().or_else(|| value["enabled"].as_bool()),
        content: value["content"].as_str(),
    }
}

fn changes(value: &Value) -> HashMap<&str, Change<'_>> {
    if let Some(rows) = value.as_array() {
        rows.iter().filter_map(|row| Some((identifier(row)?, decode_change(row)))).collect()
    } else {
        value.as_object().into_iter().flatten().filter(|(_, row)| row.is_object() || row.is_boolean())
            .map(|(id, row)| (id.as_str(), decode_change(row))).collect()
    }
}

pub fn apply_overrides(input: &Value) -> Value {
    let changes = changes(&input["overrides"]["prompts"]);
    let mut prompts = list(&input["prompts"]).to_vec();
    for prompt in &mut prompts {
        let Some(change) = identifier(prompt).and_then(|id| changes.get(id)) else { continue };
        if let Some(enabled) = change.enabled {
            prompt["enabled"] = json!(enabled);
        }
        if let Some(content) = change.content {
            prompt["content"] = json!(content);
        }
    }

    let order_override = list(&input["overrides"]["order"]);
    let mut order = if order_override.is_empty() { list(&input["order"]) } else { order_override }.to_vec();
    let mut placed = HashSet::new();
    for slot in &mut order {
        let Some(id) = identifier(slot) else { continue };
        placed.insert(id.to_owned());
        if let Some(enabled) = changes.get(id).and_then(|change| change.enabled) {
            slot["enabled"] = json!(enabled);
        }
    }
    for id in prompts.iter().filter_map(identifier) {
        if !is_marker(id) && changes.get(id).and_then(|change| change.enabled) == Some(true)
            && placed.insert(id.to_owned())
        {
            order.push(json!({"identifier": id, "enabled": true}));
        }
    }
    json!({"prompts": prompts, "order": order})
}

fn script_prompt(id: &str, prompt: &Value, enabled: bool) -> Value {
    let name = prompt["name"].as_str().filter(|name| !name.is_empty()).unwrap_or(id);
    let position = if at_depth(prompt) {
        json!({"type": "in_chat", "depth": number(&prompt["injection_depth"]).unwrap_or_default(),
            "order": number(&prompt["injection_order"]).unwrap_or_default()})
    } else {
        json!({"type": "relative"})
    };
    let mut result = json!({"id": id, "name": name, "enabled": enabled, "role": role(&prompt["role"]),
        "position": position});
    if prompt["content"].is_string() {
        result["content"] = prompt["content"].clone();
    }
    if prompt["extra"].is_object() || prompt["extra"].is_array() {
        result["extra"] = prompt["extra"].clone();
    }
    result
}

pub fn script_view(input: &Value) -> Value {
    let prompts = list(&input["prompts"]);
    let by_id: HashMap<_, _> = prompts.iter().filter_map(|row| Some((identifier(row)?, row))).collect();
    let mut placed = HashSet::new();
    let mut ordered = Vec::new();
    for row in list(&input["order"]) {
        let Some(id) = identifier(row).filter(|id| placed.insert(*id)) else { continue };
        let prompt = by_id.get(id).copied().unwrap_or(&Value::Null);
        ordered.push(script_prompt(id, prompt, enabled(row) && enabled(prompt)));
    }
    let unused: Vec<_> = prompts.iter().filter_map(|row| {
        let id = identifier(row).filter(|id| !placed.contains(*id))?;
        Some(script_prompt(id, row, enabled(row)))
    }).collect();
    json!({"prompts": ordered, "prompts_unused": unused})
}

pub fn script_edit(input: &Value) -> Result<Value, &'static str> {
    let view = &input["view"];
    let (Some(ordered), Some(unused)) = (view["prompts"].as_array(), view["prompts_unused"].as_array()) else {
        return Err("预设提示词列表格式无效");
    };
    let by_id: HashMap<_, _> = list(&input["originals"]).iter()
        .filter_map(|row| Some((identifier(row)?, row))).collect();
    let mut placed = HashSet::new();
    let mut prompts = Vec::new();
    let mut order = Vec::new();
    for (index, row) in ordered.iter().chain(unused).enumerate() {
        let id = row["id"].as_str().filter(|id| !id.trim().is_empty() && placed.insert(*id))
            .ok_or("预设提示词 ID 为空或重复")?;
        let mut prompt = by_id.get(id).copied().cloned().unwrap_or_else(|| json!({}));
        prompt["identifier"] = json!(id);
        prompt["name"] = json!(row["name"].as_str().unwrap_or(id));
        prompt["enabled"] = json!(enabled(row));
        prompt["role"] = json!(role(&row["role"]));
        if prompt["marker"].is_null() {
            prompt["marker"] = json!(is_marker(id) && !row["content"].is_string());
        }
        if row["content"].is_string() {
            prompt["content"] = row["content"].clone();
        } else if prompt["content"].is_null() {
            prompt["content"] = json!("");
        }
        let absolute = row["position"]["type"].as_str() == Some("in_chat");
        prompt["injection_position"] = json!(u8::from(absolute));
        if absolute {
            prompt["injection_depth"] = json!(number(&row["position"]["depth"]).unwrap_or_default());
            prompt["injection_order"] = json!(number(&row["position"]["order"]).unwrap_or_default());
        }
        if row["extra"].is_object() || row["extra"].is_array() {
            prompt["extra"] = row["extra"].clone();
        }
        if index < ordered.len() {
            order.push(json!({"identifier": id, "enabled": enabled(row)}));
        }
        prompts.push(prompt);
    }
    let mut result = json!({"prompts": prompts, "order": order});
    if let Some(rules) = input["view"]["extensions"].get("regex_scripts") {
        if !rules.is_array() {
            return Err("预设正则必须是数组");
        }
        if *rules != input["original_regex"] {
            result["extensions"] = json!({"regex_scripts": rules});
        }
    }
    let settings = &input["view"]["settings"];
    let mut patch = serde_json::Map::new();
    for (name, key) in [
        ("max_context", "openai_max_context"),
        ("max_completion_tokens", "openai_max_tokens"),
        ("temperature", "temp_openai"),
        ("top_p", "top_p_openai"),
    ] {
        if settings[name].is_number() {
            patch.insert(key.into(), settings[name].clone());
        }
    }
    if let Some(stream) = settings["should_stream"].as_bool() {
        patch.insert("stream_openai".into(), json!(stream));
    }
    result["settings"] = Value::Object(patch);
    Ok(result)
}
