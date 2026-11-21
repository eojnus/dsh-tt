use serde_json::{Value, json};

const BUILTIN_ORDER: &[&str] = &[
    "world_info_before",
    "persona_description",
    "char_description",
    "char_personality",
    "scenario",
    "world_info_after",
    "dialogue_examples",
    "chat_history",
];

fn push_prompt(output: &mut Vec<Value>, role: &str, content: &str) {
    if !content.is_empty() {
        output.push(json!({"role": role, "content": content}));
    }
}

fn push_explicit(output: &mut Vec<Value>, prompt: &Value) -> Result<(), &'static str> {
    let role = prompt["role"].as_str().ok_or("提示词缺少角色")?;
    if !matches!(role, "system" | "user" | "assistant") {
        return Err("提示词角色必须为 system、user 或 assistant");
    }
    if !prompt["image"].is_null() {
        return Err("辅助生成暂不支持图片提示词");
    }
    push_prompt(output, role, prompt["content"].as_str().ok_or("提示词内容必须是文本")?);
    Ok(())
}

fn insert_at_depth(history: Vec<Value>, entries: &[Value]) -> Result<Vec<Value>, &'static str> {
    let mut buckets = vec![Vec::new(); history.len() + 1];
    for entry in entries {
        let depth = entry["depth"].as_u64().unwrap_or(0).min(history.len() as u64);
        push_explicit(&mut buckets[history.len() - depth as usize], entry)?;
    }
    let mut output = Vec::new();
    let mut history = history.into_iter();
    for bucket in buckets {
        output.extend(bucket);
        output.extend(history.next());
    }
    Ok(output)
}

/// Assemble request entries without serializing DSH history blocks through WASM.
/// An index keeps attachments, tool results and adapter replay metadata intact.
pub fn assemble_chat(input: &Value) -> Option<Value> {
    let roles = input["historyRoles"].as_array()?;
    let sequence = input["sequence"].as_array()?;
    let depth = input["depth"].as_array()?;
    let mut output = Vec::new();
    for entry in sequence {
        if let Some(enabled) = entry["history"].as_bool() {
            let mut history = Vec::new();
            if enabled {
                push_prompt(&mut history, "assistant", input["greeting"].as_str().unwrap_or_default());
            }
            let start = if enabled { 0 } else {
                roles.iter().rposition(|role| role.as_str() == Some("user")).unwrap_or(0)
            };
            history.extend(roles.iter().enumerate().skip(start)
                .map(|(index, _)| json!({"index": index})));
            let mut entries: Vec<_> = depth.to_vec();
            // ST builds injection buckets from newest to oldest and then
            // reverses the result when serializing the chat history.
            entries.sort_by_key(|entry| {
                let weight = match entry["role"].as_str() {
                    Some("assistant") => 0,
                    Some("user") => 1,
                    _ => 2,
                };
                (entry["order"].as_i64().unwrap_or(100), weight)
            });
            output.extend(insert_at_depth(history, &entries).ok()?);
        } else {
            push_explicit(&mut output, entry).ok()?;
        }
    }
    adapt_system_messages(&mut output, roles, input["systemMode"].as_str().unwrap_or("native"));
    if let Some(last) = output.last_mut() {
        if last["role"].as_str() == Some("assistant") && !last["content"].is_null() {
            last["prefix"] = Value::Bool(true);
        }
    }
    Some(json!({ "entries": output, "controls": sampling(&input["presetSettings"]) }))
}

fn adapt_system_messages(output: &mut [Value], roles: &[Value], mode: &str) {
    if mode == "native" {
        return;
    }
    let mut any_conversation = false;
    let mut previous = None;
    let mut system = String::new();
    for item in output {
        if let Some(index) = item["index"].as_u64() {
            previous = roles.get(index as usize).and_then(Value::as_str);
            any_conversation = any_conversation || previous != Some("system");
            continue;
        }
        match item["role"].as_str() {
            Some("system") if !any_conversation
                || (mode == "snapshot" && matches!(previous, Some("user" | "tool" | "system"))) =>
            {
                if !system.is_empty() {
                    system.push_str("\n\n");
                }
                system.push_str(item["content"].as_str().unwrap_or_default());
                item["content"] = json!(system);
                previous = Some("system");
            }
            Some("system") => {
                // Preserve position for Messages routes where a system message
                // would be hoisted, rejected, or replace the whole prompt.
                item["role"] = json!("user");
                previous = Some("user");
            }
            Some("assistant") => {
                any_conversation = true;
                previous = Some("assistant");
            }
            _ => {
                any_conversation = true;
                previous = Some("user");
            }
        }
    }
}

fn sampling(preset: &Value) -> Value {
    let mut output = serde_json::Map::new();
    if let Some(temperature) = preset["temp_openai"].as_f64()
        .or_else(|| preset["temperature"].as_f64())
        .filter(|value| (0.0..=2.0).contains(value))
    {
        output.insert("temperature".into(), json!(temperature));
    }
    if let Some(tokens) = preset["openai_max_tokens"].as_u64().filter(|&value| value > 0 && value <= u32::MAX as u64) {
        output.insert("maxTokens".into(), json!(tokens));
    }
    let stops = &preset["custom_stopping_strings"];
    let parsed = stops.as_str().and_then(|text| serde_json::from_str::<Value>(text).ok());
    if let Some(stops) = parsed.as_ref().unwrap_or(stops).as_array() {
        let values: Vec<_> = stops.iter().filter_map(Value::as_str)
            .filter(|text| !text.is_empty()).collect();
        if !values.is_empty() {
            output.insert("stop".into(), json!(values));
        }
    }
    Value::Object(output)
}

pub fn assemble(input: &Value) -> Result<Vec<Value>, &'static str> {
    let options = &input["options"];
    if input["mode"] == "generateRaw" && !options["prompt"].is_null() {
        let mut messages = Vec::new();
        if let Some(text) = options["prompt"].as_str() {
            push_prompt(&mut messages, "user", text);
        } else if let Some(prompt) = options["prompt"].as_array() {
            for entry in prompt { push_explicit(&mut messages, entry)?; }
        } else {
            return Err("扩展的 generateRaw prompt 必须为文本或消息数组");
        }
        if messages.is_empty() { return Err("扩展的 generateRaw 至少需要一条提示词"); }
        return Ok(messages);
    }
    let order = options["ordered_prompts"].as_array();
    if order.is_none() && !options["ordered_prompts"].is_null() {
        return Err("ordered_prompts 必须是数组");
    }
    let default_order: Vec<Value> = BUILTIN_ORDER.iter().map(|key| json!(key)).collect();
    let order = order.unwrap_or(&default_order);
    let overrides = &options["overrides"];
    let history_override = &overrides["chat_history"]["prompts"];
    let history = history_override.as_array().or_else(|| input["history"].as_array());
    let has_explicit_input = order.iter().any(|item| item.as_str() == Some("user_input"));
    let user_input = options["user_input"].as_str().unwrap_or_default();
    let mut appended_input = false;
    let mut output = Vec::new();
    if order.len() > 2000 {
        return Err("辅助生成提示词条目过多");
    }

    for prompt in order {
        match prompt.as_str() {
            Some("user_input") => push_prompt(&mut output, "user", user_input),
            Some("chat_history") => {
                let mut active_history = Vec::new();
                if let Some(history) = history {
                    let count = options["max_chat_history"].as_u64()
                        .map_or(history.len(), |limit| limit.min(history.len() as u64) as usize);
                    for message in history.iter().skip(history.len() - count) {
                        push_explicit(&mut active_history, message)?;
                    }
                }
                if !has_explicit_input && !appended_input {
                    push_prompt(&mut active_history, "user", user_input);
                    appended_input = true;
                }
                if overrides["chat_history"]["with_depth_entries"].as_bool() != Some(false) {
                    if let Some(entries) = input["depth"].as_array() {
                        active_history = insert_at_depth(active_history, entries)?;
                    }
                }
                output.extend(active_history);
            }
            Some(key) if BUILTIN_ORDER.contains(&key) => {
                let text = overrides[key].as_str().or_else(|| input["builtins"][key].as_str());
                push_prompt(&mut output, "system", text.unwrap_or_default());
            }
            Some(_) => return Err("未知的内置提示词位置"),
            None => push_explicit(&mut output, prompt)?,
        }
    }
    if !has_explicit_input && !appended_input {
        push_prompt(&mut output, "user", user_input);
    }
    if output.is_empty() {
        return Err("辅助生成至少需要一条提示词");
    }
    Ok(output)
}

pub fn auxiliary_controls(input: &Value) -> Value {
    let options = &input["options"];
    if input["mode"] != "generateRaw" || options["prompt"].is_null() {
        return json!({});
    }
    sampling(&json!({
        "temperature": options["temperature"],
        "openai_max_tokens": options.get("max_tokens").unwrap_or(&options["responseLength"]),
        "custom_stopping_strings": options["stop"],
    }))
}

pub fn partition_injections(input: &Value) -> Option<Value> {
    let mut depth = Vec::new();
    let mut scan = Vec::new();
    for item in input.as_array()? {
        let (Some(content), Some(position)) = (item["content"].as_str(), item["position"].as_str()) else {
            continue;
        };
        if !matches!(position, "none" | "in_chat") || content.is_empty() {
            continue;
        }
        if item["should_scan"].as_bool() == Some(true) {
            scan.push(json!(content));
        }
        if position == "in_chat" {
            let role = item["role"].as_str().unwrap_or("system");
            if matches!(role, "system" | "user" | "assistant") {
                depth.push(json!({"role": role, "content": content, "depth": item["depth"].as_u64().unwrap_or(0)}));
            }
        }
    }
    Some(json!({"depth": depth, "scan": scan}))
}
