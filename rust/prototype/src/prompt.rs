use crate::preset::{self, BUILTINS};
use serde_json::{Value, json};
use std::borrow::Cow;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

pub fn plan(input: &Value) -> Option<Value> {
    let prompts = input["prompts"].as_array()?;
    let order = input["order"].as_array()?;
    let mut by_id = HashMap::new();
    let mut slot_enabled = HashMap::new();
    for (index, prompt) in prompts.iter().enumerate() {
        by_id.entry(prompt[0].as_str()?).or_insert(index);
    }
    for slot in order {
        slot_enabled
            .entry(slot[0].as_str()?)
            .or_insert(slot[1].as_bool()?);
    }
    let enabled = |id: &str| {
        by_id
            .get(id)
            .is_none_or(|&index| prompts[index][1].as_bool() == Some(true))
    };
    let markers: Vec<_> = BUILTINS
        .iter().copied()
        .filter(|&id| match id {
            "personaDescription" => true,
            "nsfw" | "jailbreak" => {
                by_id.contains_key(id) && enabled(id) && slot_enabled.get(id) != Some(&false)
            }
            _ => enabled(id) && slot_enabled.get(id) != Some(&false),
        })
        .collect();

    let mut ordered = Vec::new();
    for slot in order {
        let id = slot[0].as_str()?;
        if slot[1].as_bool() != Some(true)
            || BUILTINS.contains(&id)
            || matches!(id, "chatHistory" | "enhanceDefinitions")
        {
            continue;
        }
        if let Some(&index) = by_id.get(id) {
            let prompt = &prompts[index];
            if prompt[1].as_bool() == Some(true) && prompt[2].as_bool() == Some(true) {
                ordered.push((index, prompt[3].as_bool()?));
            }
        }
    }
    Some(json!({ "markers": markers, "ordered": ordered }))
}

pub fn depth_order(input: &[f64]) -> Vec<usize> {
    let mut indices: Vec<_> = (0..input.len()).collect();
    indices.sort_by(|&a, &b| input[b].partial_cmp(&input[a]).unwrap_or(Ordering::Equal));
    indices
}

/// Select and resolve authored prompts. Evaluation of dynamic world book
/// sources stays with the renderer and follows these actions in order.
pub fn prepare_chat(input: &Value, decorate: impl FnMut(&str) -> String) -> Option<Value> {
    let mut by_id = HashMap::new();
    for prompt in input["prompts"].as_array()? {
        if let Some(id) = prompt["identifier"].as_str() {
            by_id.entry(id).or_insert(prompt);
        }
    }
    let slots = input["order"].as_array()?;
    let listed: HashSet<_> = slots.iter().filter_map(|slot| slot["identifier"].as_str()).collect();
    let history = "chatHistory";
    let phi = "jailbreak";
    let mut actions = Vec::new();
    let mut seen = HashSet::new();
    let mut add = |id: &str, enabled: bool| {
        if !seen.insert(id.to_owned()) {
            return;
        }
        let prompt = by_id.get(id).copied().unwrap_or(&Value::Null);
        let enabled = enabled && preset::enabled(prompt);
        if id == history {
            actions.push(json!({"history": enabled}));
            actions.push(json!({"source": "authorsNote", "role": "system", "label": "worldInfo:authorsNote"}));
            if !listed.contains(phi) {
                let prompt = by_id.get(phi).copied().unwrap_or(&Value::Null);
                if preset::enabled(prompt) {
                    actions.push(resolve_prompt(phi, prompt, input));
                }
            }
        } else if enabled && (BUILTINS.contains(&id) || !prompt.is_null()) {
            actions.push(resolve_prompt(id, prompt, input));
        }
    };
    for &marker in BUILTINS {
        if marker != phi && !listed.contains(marker) {
            add(marker, true);
        }
    }
    for slot in slots {
        if let Some(id) = slot["identifier"].as_str() {
            add(id, preset::enabled(slot));
        }
    }
    if !listed.contains(history) {
        add(history, true);
    }
    if let Some(prefix) = input["prefix"].as_str().filter(|prefix| !blank(prefix)) {
        actions.push(json!({"role": "assistant", "content": prefix, "prefix": true}));
    }
    group_chat(actions, decorate)
}

fn resolve_prompt(id: &str, prompt: &Value, input: &Value) -> Value {
    let label = prompt["name"].as_str().filter(|name| !name.is_empty()).unwrap_or(id);
    let mut part = json!({"label": label, "role": preset::role(&prompt["role"])});
    if preset::at_depth(prompt) {
        let order = prompt.get("injection_order").filter(|value| !value.is_null())
            .map_or(100.0, |value| preset::number(value).unwrap_or_default());
        part["depth"] = json!(preset::number(&prompt["injection_depth"]).unwrap_or_default());
        part["order"] = json!(order);
    }
    if matches!(id, "worldInfoBefore" | "worldInfoAfter") {
        part["source"] = json!(id);
        return part;
    }
    let authored = match id {
        "charDescription" | "charPersonality" | "personaDescription" | "scenario" => &input["builtins"][id],
        "enhanceDefinitions" => &Value::Null,
        _ => &prompt["content"],
    };
    let authored = prompt_text(authored);
    let card_override = input["overrides"][id].as_str().filter(|text| !text.is_empty());
    part["content"] = if prompt["forbid_overrides"].as_bool() != Some(true) {
        json!(card_override.map_or_else(|| authored.to_string(), |text| replace_original(text, &authored)))
    } else {
        json!(authored)
    };
    part
}

fn prompt_text(value: &Value) -> Cow<'_, str> {
    match value {
        Value::String(text) => Cow::Borrowed(text),
        Value::Null | Value::Bool(false) => Cow::Borrowed(""),
        Value::Number(number) if number.as_f64() == Some(0.0) => Cow::Borrowed(""),
        Value::Array(items) => Cow::Owned(items.iter().map(|item| match item {
            Value::Bool(value) => Cow::Owned(value.to_string()),
            Value::Number(value) => Cow::Owned(value.to_string()),
            _ => prompt_text(item),
        }).collect::<Vec<_>>().join(",")),
        Value::Object(_) => Cow::Borrowed("[object Object]"),
        _ => Cow::Owned(value.to_string()),
    }
}

fn replace_original(text: &str, original: &str) -> String {
    const TOKEN: &[u8] = b"{{original}}";
    let mut result = String::new();
    let mut start = 0;
    for (index, window) in text.as_bytes().windows(TOKEN.len()).enumerate() {
        if window.eq_ignore_ascii_case(TOKEN) {
            result.push_str(&text[start..index]);
            result.push_str(original);
            start = index + TOKEN.len();
        }
    }
    result.push_str(&text[start..]);
    result
}

fn blank(text: &str) -> bool {
    text.trim_matches(|ch: char| ch == '\u{feff}' || (ch.is_whitespace() && ch != '\u{85}')).is_empty()
}

/// Group adjacent system text for cross-fragment EJS while keeping each
/// user/assistant message and the history slot distinct.
fn group_chat(actions: Vec<Value>, mut decorate: impl FnMut(&str) -> String) -> Option<Value> {
    let mut groups: Vec<Value> = Vec::new();
    let mut injected = Vec::new();
    let mut trace = Vec::new();
    for part in actions {
        if part["history"].is_boolean() {
            groups.push(json!({"history": part["history"]}));
            continue;
        }
        let dynamic;
        let content = if let Some(source) = part["source"].as_str() {
            dynamic = decorate(source);
            &dynamic
        } else if let Some(content) = part["content"].as_str() {
            content
        } else {
            continue;
        };
        let role = part["role"].as_str()?;
        if part["depth"].is_number() {
            if !content.is_empty() {
                injected.push(json!({"role": role, "content": content, "depth": part["depth"], "order": part["order"]}));
            }
            continue;
        }
        if blank(content) {
            continue;
        }
        if let Some(label) = part["label"].as_str() {
            trace.push(json!({"label": label, "chars": content.encode_utf16().count(), "rendered": 0}));
        }
        if role == "system" && groups.last().is_some_and(|last| last["role"] == "system") {
            let last = groups.last_mut()?;
            let Value::String(text) = &mut last["content"] else { return None };
            text.push_str("\n\n");
            text.push_str(content);
        } else {
            let mut group = json!({"role": role, "content": content});
            if part["prefix"].as_bool() == Some(true) {
                group["prefix"] = Value::Bool(true);
            }
            groups.push(group);
        }
    }
    Some(json!({"groups": groups, "injected": injected, "trace": trace}))
}
