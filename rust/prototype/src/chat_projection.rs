use serde_json::{Value, json};

fn step_key(event: &Value) -> Option<String> {
    let turn = event["turn"].as_i64()?;
    let step = event["step"].as_i64()?;
    Some(format!("reply-{turn}-{step}"))
}

/// Plan presentation using block indices so attachments, durable event
/// metadata and UTF-16 text can stay on the host side of the boundary.
pub fn floor_plan(input: &Value) -> Option<Value> {
    let mut floors = Vec::new();
    for (index, event) in input.as_array()?.iter().enumerate() {
        let role = match event["kind"].as_str() {
            Some("assistant/message") => "assistant",
            Some("user/message") if event["source"] != "runtime-context" => "user",
            _ => continue,
        };
        let mut text = Vec::new();
        let mut reasoning = Vec::new();
        for (index, block) in event["blocks"].as_array()?.iter().enumerate() {
            match block.as_str() {
                Some("text") => text.push(index),
                Some("reasoning") if role == "assistant" => reasoning.push(index),
                _ => {}
            }
        }
        if !text.is_empty() {
            let key = (role == "assistant" && event["append"] == true).then(|| step_key(event)).flatten();
            floors.push(json!({"index": index, "role": role, "text": text, "reasoning": reasoning, "replyKey": key}));
        }
    }
    Some(json!(floors))
}

pub fn live_plan(input: &Value) -> Option<Value> {
    let mut start = None;
    let mut key = None;
    let mut text = Vec::new();
    let mut reasoning = Vec::new();
    for (index, event) in input.as_array()?.iter().enumerate() {
        match event["kind"].as_str() {
            Some("assistant/live-chunk") => {
                let attempt = &event["attemptId"];
                if start.is_none_or(|(active, _)| active != attempt) {
                    start = Some((attempt, index));
                    key = step_key(event);
                    text.clear();
                    reasoning.clear();
                }
                match event["chunk"].as_str() {
                    Some("text-delta") => text.push(index),
                    Some("reasoning-delta") => reasoning.push(index),
                    _ => {}
                }
            }
            Some("assistant/message" | "assistant/attempt" | "step/end") => {
                if start.is_some() && key.is_some() && step_key(event) == key {
                    start = None;
                }
            }
            _ => {}
        }
    }
    let (_, index) = start?;
    if text.is_empty() && reasoning.is_empty() {
        return None;
    }
    Some(json!({"index": index, "replyKey": key, "text": text, "reasoning": reasoning}))
}

/// Stitch a live durable window over the history read from the session.
pub fn merge_floor_window(input: &Value) -> Option<Value> {
    let historical = input["history"].as_array()?;
    let recent = input["recent"].as_array()?;
    if recent.is_empty() {
        return Some(json!((0..historical.len()).collect::<Vec<_>>()));
    }
    let first = recent.first()?.as_i64()?;
    let last = recent.last()?.as_i64()?;
    let mut projection = Vec::new();
    projection.extend(historical.iter().enumerate().filter_map(|(index, seq)| (seq.as_i64()? < first).then_some(index)));
    projection.extend(historical.len()..(historical.len() + recent.len()));
    projection.extend(historical.iter().enumerate().filter_map(|(index, seq)| (seq.as_i64()? > last).then_some(index)));
    let limit = input["limit"].as_u64().and_then(|limit| usize::try_from(limit).ok()).unwrap_or(projection.len());
    Some(json!(&projection[projection.len().saturating_sub(limit)..]))
}
