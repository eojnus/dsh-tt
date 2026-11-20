mod display;
mod generation;
mod png;

use serde_json::Value;

// Callers own input and output buffers and release both through dealloc.
#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let bytes = vec![0u8; len].into_boxed_slice();
    Box::into_raw(bytes) as *mut u8
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    unsafe { drop(Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len))) }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn utf16_len(ptr: *const u8, len: usize) -> i32 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    match std::str::from_utf8(bytes) {
        Ok(text) => i32::try_from(text.encode_utf16().count()).unwrap_or(-1),
        Err(_) => -1,
    }
}

// A zero result asks the caller to retry the input with its JS parser. Otherwise,
// the low 32 bits hold the output pointer and the high 32 bits hold the byte count.
fn json_output(value: &Value) -> u64 {
    let bytes = serde_json::to_vec(value).expect("serializing a JSON value");
    let len = bytes.len() as u64;
    let ptr = Box::into_raw(bytes.into_boxed_slice()) as *mut u8;
    (len << 32) | ptr as u64
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn normalize_card_text(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(Value::Object(mut fields)) = serde_json::from_slice(bytes) else {
        return 0;
    };
    for (key, value) in &mut fields {
        if key == "tags" || key == "alternateGreetings" {
            if let Value::Array(items) = value {
                items.retain(Value::is_string);
            } else {
                *value = Value::Array(Vec::new());
            }
        } else {
            if !value.is_string() {
                *value = Value::String(String::new());
            }
            if key == "name" && value.as_str() == Some("") {
                *value = Value::String("未命名角色".into());
            }
        }
    }
    json_output(&Value::Object(fields))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn scan_png(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    match png::text_chunks(bytes) {
        Some(chunks) => json_output(&serde_json::json!(chunks)),
        None => 0,
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn match_lorebook_keywords(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(batches) = serde_json::from_slice::<Vec<(String, Vec<String>)>>(bytes) else {
        return 0;
    };
    let matches: Vec<Vec<bool>> = batches
        .iter()
        .map(|(text, keys)| keys.iter().map(|key| text.contains(key)).collect())
        .collect();
    json_output(&serde_json::json!(matches))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn assemble_generation(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else {
        return 0;
    };
    let output = match generation::assemble(&input) {
        Ok(messages) => serde_json::json!({"messages": messages}),
        Err(message) => serde_json::json!({"error": message}),
    };
    json_output(&output)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn encode_display_capture(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else {
        return 0;
    };
    match display::encode_capture(&input) {
        Some(output) => json_output(&Value::String(output)),
        None => 0,
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn partition_prompt_injections(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else {
        return 0;
    };
    generation::partition_injections(&input).as_ref().map_or(0, json_output)
}
