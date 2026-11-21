use serde_json::{Value, json};
use std::collections::BTreeMap;

const BLOCK: usize = 512;
const MAX_FILES: usize = 2048;
const MAX_MANIFEST: usize = 64 * 1024;

pub fn github_repository(value: &Value) -> Result<Value, &'static str> {
    let url = value.as_str().unwrap_or_default().trim().split(['?', '#']).next()
        .unwrap_or_default().trim_end_matches('/');
    let invalid = "请输入 GitHub 仓库地址，例如 https://github.com/作者/扩展.git";
    let path = url.strip_prefix("https://").unwrap_or(url);
    let (host, path) = path.split_once('/').ok_or(invalid)?;
    let (owner, repo) = path.split_once('/').ok_or(invalid)?;
    let repo = repo.strip_suffix(".git").unwrap_or(repo);
    let valid_owner = !owner.is_empty() && owner.len() <= 39
        && owner.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
    let valid_repo = !repo.is_empty() && repo.len() <= 100 && !matches!(repo, "." | "..")
        && repo.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte));
    if !host.eq_ignore_ascii_case("github.com") || !valid_owner || !valid_repo {
        return Err(invalid);
    }
    Ok(json!({ "owner": owner.to_ascii_lowercase(), "repo": repo.to_ascii_lowercase() }))
}

fn octal(field: &[u8]) -> Option<usize> {
    let field = std::str::from_utf8(field).ok()?.trim_matches(['\0', ' ']);
    if field.is_empty() { Some(0) } else { usize::from_str_radix(field, 8).ok() }
}

fn field(bytes: &[u8]) -> Option<&str> {
    std::str::from_utf8(bytes.split(|byte| *byte == 0).next()?).ok()
}

fn safe_path(path: &str) -> bool {
    path.len() <= 1024 && path.split('/').all(|part| !part.is_empty() && !matches!(part, "." | "..")
        && !part.contains(['\\', ':']) && !part.chars().any(char::is_control))
}

fn pax_path(mut bytes: &[u8]) -> Option<&str> {
    let mut path = None;
    while !bytes.is_empty() {
        let space = bytes.iter().position(|&byte| byte == b' ')?;
        let size = std::str::from_utf8(&bytes[..space]).ok()?.parse::<usize>().ok()?;
        if size <= space + 1 || bytes.get(size - 1) != Some(&b'\n') { return None; }
        let record = std::str::from_utf8(&bytes[space + 1..size - 1]).ok()?;
        if let Some(value) = record.strip_prefix("path=") {
            path = Some(value);
        }
        bytes = &bytes[size..];
    }
    path
}

/// Index files in a GitHub archive without extracting repository paths.
/// Only regular files beneath the single top-level directory are served.
pub fn index_archive(bytes: &[u8]) -> Result<Value, &'static str> {
    let invalid = "GitHub 返回了无效的扩展归档";
    let mut position = 0usize;
    let mut root = None;
    let mut files = BTreeMap::new();
    let mut pending_name = None;
    loop {
        let end = position.checked_add(BLOCK).ok_or(invalid)?;
        let header = bytes.get(position..end).ok_or(invalid)?;
        if header.iter().all(|&byte| byte == 0) {
            break;
        }
        let checksum: usize = header.iter().enumerate()
            .map(|(index, &byte)| usize::from(if (148..156).contains(&index) { b' ' } else { byte })).sum();
        if octal(&header[148..156]) != Some(checksum) {
            return Err(invalid);
        }
        let size = octal(&header[124..136]).ok_or(invalid)?;
        let contents = bytes.get(end..end.checked_add(size).ok_or(invalid)?).ok_or(invalid)?;
        position = end.checked_add(size.checked_add(BLOCK - 1).ok_or(invalid)? / BLOCK * BLOCK).ok_or(invalid)?;
        match header[156] {
            b'g' => continue,
            b'x' => {
                pending_name = pax_path(contents);
                continue;
            }
            b'L' => {
                pending_name = field(contents).map(str::trim_end);
                continue;
            }
            _ => {}
        }
        let name = field(&header[..100]).ok_or(invalid)?;
        let prefix = field(&header[345..500]).ok_or(invalid)?;
        let path = pending_name.take().map(str::to_owned)
            .unwrap_or_else(|| if prefix.is_empty() { name.to_owned() } else { format!("{prefix}/{name}") });
        let path = path.trim_end_matches('/');
        if !safe_path(path) {
            return Err("扩展归档包含无效文件路径");
        }
        let (folder, file) = path.split_once('/').unwrap_or((path, ""));
        if *root.get_or_insert_with(|| folder.to_owned()) != folder {
            return Err(invalid);
        }
        if !matches!(header[156], 0 | b'0') { continue; }
        if file.is_empty() || files.insert(file.to_owned(), (end, size)).is_some() {
            return Err(invalid);
        }
        if files.len() > MAX_FILES { return Err("扩展归档的文件数量过多"); }
    }
    let &(offset, size) = files.get("manifest.json").ok_or("仓库根目录缺少 SillyTavern manifest.json")?;
    if size > MAX_MANIFEST { return Err("扩展清单过大"); }
    let manifest: Value = serde_json::from_slice(&bytes[offset..offset + size]).map_err(|_| "扩展清单 JSON 无效")?;
    let entry = |key| -> Result<Option<&str>, &'static str> {
        match &manifest[key] {
            Value::Null => Ok(None),
            Value::String(path) if path.trim().is_empty() => Ok(None),
            Value::String(path) => {
                let path = path.trim().trim_start_matches("./");
                if !safe_path(path) || !files.contains_key(path) {
                    return Err("扩展清单指定的入口文件不存在或路径无效");
                }
                Ok(Some(path))
            }
            _ => Err("扩展清单的入口字段必须是文件路径"),
        }
    };
    let js = entry("js")?;
    let css = entry("css")?;
    if js.is_none() && css.is_none() { return Err("扩展清单未指定浏览器 JS 或 CSS 入口"); }
    if js.is_some_and(|path| !path.ends_with(".js") && !path.ends_with(".mjs"))
        || css.is_some_and(|path| !path.ends_with(".css")) {
        return Err("扩展入口文件类型无效");
    }
    let requires: Vec<_> = manifest["requires"].as_array().into_iter().flatten()
        .filter_map(Value::as_str).collect();
    let loading_order = manifest["loading_order"].as_i64()
        .or_else(|| manifest["loading_order"].as_str()?.parse().ok()).unwrap_or_default();
    Ok(json!({
        "manifest": { "name": manifest["display_name"].as_str(), "version": manifest["version"].as_str(),
            "js": js, "css": css, "loadingOrder": loading_order, "requires": requires,
            "generateInterceptor": manifest["generate_interceptor"].as_str() },
        "files": files
    }))
}
