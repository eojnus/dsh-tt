mod chat_projection;
mod display;
mod extensions;
mod generation;
mod lorebook;
mod message;
mod png;
mod preset;
mod prompt;
mod slash;
mod worldbook_edit;

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

fn json_operation(ptr: *const u8, len: usize, operation: impl FnOnce(&Value) -> Option<Value>) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else { return 0 };
    operation(&input).as_ref().map_or(0, json_output)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn extension_repository(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| Some(match extensions::github_repository(input) {
        Ok(repo) => repo,
        Err(error) => serde_json::json!({"error": error}),
    }))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn index_extension_archive(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    json_output(&match extensions::index_archive(bytes) {
        Ok(index) => index,
        Err(error) => serde_json::json!({"error": error}),
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn parse_extension_commands(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| {
        Some(match slash::parse(input.as_str()?) {
            Ok(parsed) => parsed,
            Err(error) => serde_json::json!({"error": error}),
        })
    })
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn plan_message_action(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| slash::message_action(input.as_str()?))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn edit_extension_worldbook(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| Some(match worldbook_edit::apply(input) {
        Ok(result) => result,
        Err(error) => serde_json::json!({"error": error}),
    }))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn normalize_preset(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| Some(preset::normalize(input)))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn apply_preset_overrides(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| Some(preset::apply_overrides(input)))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn view_script_preset(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| Some(preset::script_view(input)))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn edit_script_preset(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| Some(match preset::script_edit(input) {
        Ok(data) => data,
        Err(error) => serde_json::json!({"error": error}),
    }))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn project_chat_floors(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, chat_projection::floor_plan)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn project_live_reply(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, chat_projection::live_plan)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn merge_floor_window(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, chat_projection::merge_floor_window)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn layout_message_fences(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(source) = serde_json::from_slice::<String>(bytes) else {
        return 0;
    };
    message::fence_layout(&source)
        .as_ref()
        .map_or(0, json_output)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn project_message_prose(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, message::project_prose)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn normalize_grouped_choices(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| {
        Some(Value::String(message::normalize_grouped_choices(input.as_str()?)))
    })
}

#[cfg(target_arch = "wasm32")]
#[link(wasm_import_module = "dsh_tt")]
unsafe extern "C" {
    fn start_lorebook_round(ptr: *const u8, len: usize);
    fn match_lorebook_entry(index: usize) -> i32;
    fn lorebook_random() -> f64;
    fn sort_legacy_lorebook_entries(ptr: *mut u32, len: usize, grouped: u32);
    fn decorate_chat_source(ptr: *const u8, len: usize) -> u64;
}

#[cfg(target_arch = "wasm32")]
struct HostMatcher;

#[cfg(target_arch = "wasm32")]
impl lorebook::Matcher for HostMatcher {
    fn start_round(&mut self, recursive_text: &str) {
        unsafe { start_lorebook_round(recursive_text.as_ptr(), recursive_text.len()) };
    }

    fn match_entry(&mut self, index: usize) -> i32 {
        unsafe { match_lorebook_entry(index) }
    }

    fn random(&mut self) -> f64 {
        unsafe { lorebook_random() }
    }

    fn legacy_sort(&mut self, candidates: &mut [u32], grouped: bool) {
        unsafe {
            sort_legacy_lorebook_entries(
                candidates.as_mut_ptr(),
                candidates.len(),
                u32::from(grouped),
            )
        };
    }
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn activate_lorebook(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else {
        return 0;
    };
    lorebook::activate(&input, &mut HostMatcher)
        .as_ref()
        .map_or(0, json_output)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn layout_lorebook_buckets(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else {
        return 0;
    };
    lorebook::bucket_layout(&input)
        .as_ref()
        .map_or(0, json_output)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn build_lorebook_scan_windows(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else {
        return 0;
    };
    lorebook::scan_windows(&input)
        .as_ref()
        .map_or(0, json_output)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn plan_main_prompt(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else {
        return 0;
    };
    prompt::plan(&input).as_ref().map_or(0, json_output)
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn order_prompt_depth(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(depths) = serde_json::from_slice::<Vec<f64>>(bytes) else {
        return 0;
    };
    json_output(&serde_json::json!(prompt::depth_order(&depths)))
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
        Ok(messages) => serde_json::json!({"messages": messages, "controls": generation::auxiliary_controls(&input)}),
        Err(message) => serde_json::json!({"error": message}),
    };
    json_output(&output)
}

#[cfg(target_arch = "wasm32")]
#[unsafe(no_mangle)]
pub unsafe extern "C" fn prepare_chat_templates(ptr: *const u8, len: usize) -> u64 {
    json_operation(ptr, len, |input| prompt::prepare_chat(input, |source| {
        let result = unsafe { decorate_chat_source(source.as_ptr(), source.len()) };
        if result == 0 {
            return String::new();
        }
        let ptr = result as u32 as *mut u8;
        let len = (result >> 32) as usize;
        // The callback allocates this UTF-8 buffer through alloc and passes ownership back.
        let bytes = unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)) };
        String::from_utf8(bytes.into_vec()).unwrap_or_default()
    }))
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn assemble_chat_prompt(ptr: *const u8, len: usize) -> u64 {
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    let Ok(input) = serde_json::from_slice(bytes) else { return 0 };
    generation::assemble_chat(&input).as_ref().map_or(0, json_output)
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
    generation::partition_injections(&input)
        .as_ref()
        .map_or(0, json_output)
}
