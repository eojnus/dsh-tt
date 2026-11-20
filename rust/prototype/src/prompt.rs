use serde_json::{Value, json};
use std::cmp::Ordering;
use std::collections::HashMap;

const BUILTINS: [&str; 9] = [
    "worldInfoBefore",
    "main",
    "worldInfoAfter",
    "charDescription",
    "charPersonality",
    "scenario",
    "personaDescription",
    "nsfw",
    "jailbreak",
];

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
        .into_iter()
        .filter(|&id| match id {
            "personaDescription" => true,
            "nsfw" | "jailbreak" => by_id.contains_key(id) && enabled(id),
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
