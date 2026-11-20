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

pub fn assemble(input: &Value) -> Result<Vec<Value>, &'static str> {
    let options = &input["options"];
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
