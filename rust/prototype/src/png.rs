type TextChunk = (usize, usize, usize, usize, &'static str);

fn find_nul(bytes: &[u8], start: usize) -> Option<usize> {
    bytes
        .get(start..)?
        .iter()
        .position(|&byte| byte == 0)
        .map(|offset| start + offset)
}

fn text_chunk(kind: &[u8], data: &[u8], start: usize) -> Option<TextChunk> {
    let keyword_end = find_nul(data, 0)?;
    let (payload, encoding) = match kind {
        b"tEXt" if keyword_end > 0 => (keyword_end + 1, "latin1"),
        b"iTXt" => {
            let language_end = find_nul(data, keyword_end + 3)?;
            let translated_end = find_nul(data, language_end + 1)?;
            let encoding = if data[keyword_end + 1] == 1 {
                "compressed"
            } else {
                "utf8"
            };
            (translated_end + 1, encoding)
        }
        _ => return None,
    };
    Some((
        start,
        start + keyword_end,
        start + payload,
        start + data.len(),
        encoding,
    ))
}

// Return ranges into the original bytes so image data and card text need only
// cross into WASM once. JavaScript decodes the text and parses the original JSON.
pub fn text_chunks(bytes: &[u8]) -> Option<Vec<TextChunk>> {
    let signature = b"\x89PNG\r\n\x1a\n";
    let mut rest = bytes.strip_prefix(signature)?;
    let mut chunks = Vec::new();
    while rest.len() >= 12 {
        let len = u32::from_be_bytes(rest[..4].try_into().ok()?) as usize;
        if len > rest.len() - 12 {
            break;
        }
        let kind = &rest[4..8];
        if kind == b"IEND" {
            break;
        }
        if kind == b"tEXt" || kind == b"iTXt" {
            let start = bytes.len() - rest.len() + 8;
            if let Some(chunk) = text_chunk(kind, &rest[8..8 + len], start) {
                chunks.push(chunk);
            }
        }
        rest = &rest[12 + len..];
    }
    Some(chunks)
}
