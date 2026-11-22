use serde_json::{Value, json};

struct Fence {
    marker: u8,
    length: usize,
    info: (usize, usize),
}

impl Fence {
    fn at_line(line: &str, start: usize, end: usize) -> Option<Self> {
        let bytes = line.as_bytes();
        let indent = bytes.iter().take_while(|&&byte| byte == b' ').count();
        if indent > 3 {
            return None;
        }
        let marker = *bytes.get(indent)?;
        if !matches!(marker, b'`' | b'~') {
            return None;
        }
        let length = bytes[indent..]
            .iter()
            .take_while(|&&byte| byte == marker)
            .count();
        (length >= 3).then_some(Self {
            marker,
            length,
            info: (start + indent + length, end),
        })
    }

    fn closes(&self, opening: &Self, line: &str, start: usize) -> bool {
        self.marker == opening.marker
            && self.length >= opening.length
            && line[self.info.0 - start..].chars().all(js_whitespace)
    }
}

fn js_whitespace(ch: char) -> bool {
    matches!(ch, '\u{0009}'..='\u{000d}' | ' ' | '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' |
        '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

#[derive(Default)]
struct Span(Option<(usize, usize)>);

impl Span {
    fn add(&mut self, start: usize, end: usize) {
        self.0 = Some((self.0.map_or(start, |span| span.0), end));
    }

    fn finish_fence(&mut self, kind: usize, fence: &Fence) -> [usize; 5] {
        let (start, end) = self.0.take().unwrap_or((fence.info.1, fence.info.1));
        [kind, start, end, fence.info.0, fence.info.1]
    }
}

// Offsets count UTF-16 code units so the browser can slice its original string.
// The browser retains the existing rules for which blocks may render as HTML.
pub fn fence_layout(source: &str) -> Option<Value> {
    if source.contains(['\r', '\u{2028}', '\u{2029}']) {
        return None;
    }
    let mut spans = Vec::new();
    let mut opening: Option<Fence> = None;
    let mut prose = Span::default();
    let mut code = Span::default();
    let mut start = 0;
    for line in source.split('\n') {
        let end = start + line.encode_utf16().count();
        let marker = Fence::at_line(line, start, end);
        if let Some(fence) = &opening {
            if marker.is_some_and(|marker| marker.closes(fence, line, start)) {
                spans.push(code.finish_fence(1, fence));
                opening = None;
            } else {
                code.add(start, end);
            }
        } else if let Some(marker) = marker {
            if let Some((lo, hi)) = prose.0.take() {
                spans.push([0, lo, hi, 0, 0]);
            }
            opening = Some(marker);
        } else {
            prose.add(start, end);
        }
        start = end + 1;
    }
    if let Some(fence) = &opening {
        spans.push(code.finish_fence(2, fence));
    }
    if let Some((lo, hi)) = prose.0 {
        spans.push([0, lo, hi, 0, 0]);
    }
    Some(json!(spans))
}

struct Tag<'a> {
    name: &'a str,
    end: usize,
    closing: bool,
    empty: bool,
}

fn read_tag(source: &str) -> Option<Tag<'_>> {
    let bytes = source.as_bytes();
    let closing = bytes.get(1) == Some(&b'/');
    let start = 1 + usize::from(closing);
    if !bytes.get(start)?.is_ascii_alphabetic() {
        return None;
    }
    let end = start
        + bytes[start..]
            .iter()
        .take_while(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-' | b':' | b'~'))
            .count();
    if bytes
        .get(end)
        .is_some_and(|byte| !byte.is_ascii_whitespace() && !matches!(byte, b'/' | b'>'))
    {
        return None;
    }
    let mut quote = None;
    for (index, &byte) in bytes.iter().enumerate().skip(end) {
        match (quote, byte) {
            (Some(open), close) if open == close => quote = None,
            (None, b'\'' | b'"') => quote = Some(byte),
            (None, b'<') => return None,
            (None, b'>') => {
                return Some(Tag {
                    name: &source[start..end],
                    end: index + 1,
                    closing,
                    empty: source[..index].trim_end().ends_with('/'),
                });
            }
            _ => {}
        }
    }
    // Hide a partial tag too. Streaming reparses each snapshot from the beginning.
    Some(Tag {
        name: &source[start..end],
        end: source.len(),
        closing,
        empty: false,
    })
}

#[derive(Default)]
struct MessageVisibility<'a> {
    hidden: Option<(&'a str, usize)>,
    in_comment: bool,
}

impl<'a> MessageVisibility<'a> {
    fn visible(&self) -> bool {
        self.hidden.is_none() && !self.in_comment
    }

    fn prose(&mut self, mut source: &'a str, hidden_tags: &[Value]) -> String {
        let mut output = String::new();
        while !source.is_empty() {
            if self.in_comment {
                let Some(end) = source.find("-->") else { break };
                source = &source[end + 3..];
                self.in_comment = false;
                continue;
            }
            let start = source.find('<').unwrap_or(source.len());
            if self.visible() {
                output.push_str(&source[..start]);
            }
            source = &source[start..];
            if source.is_empty() {
                break;
            }
            if source.starts_with("<!--") && self.visible() {
                source = &source[4..];
                self.in_comment = true;
                continue;
            }
            let Some(tag) = read_tag(source) else {
                if self.visible() {
                    output.push('<');
                }
                source = &source[1..];
                continue;
            };
            if let Some((name, depth)) = self.hidden {
                if name.eq_ignore_ascii_case(tag.name) {
                    if tag.closing {
                        self.hidden = (depth > 1).then_some((name, depth - 1));
                    } else if !tag.empty
                        && !name.eq_ignore_ascii_case("style")
                        && !name.eq_ignore_ascii_case("script")
                    {
                        self.hidden = Some((name, depth + 1));
                    }
                }
            } else if !tag.closing
                && !tag.empty
                && hidden_tags.iter().any(|value| {
                    value
                        .as_str()
                        .is_some_and(|name| name.eq_ignore_ascii_case(tag.name))
                })
            {
                self.hidden = Some((tag.name, 1));
            } else if tag.name.eq_ignore_ascii_case("br")
                || (tag.closing
                    && (tag.name.eq_ignore_ascii_case("p") || tag.name.eq_ignore_ascii_case("div")))
            {
                output.push_str("\n\n");
            }
            source = &source[tag.end..];
        }
        output
    }
}

pub fn project_prose(input: &Value) -> Option<Value> {
    let hidden = input.get("hidden")?.as_array()?;
    let mut visibility = MessageVisibility::default();
    let blocks = input
        .get("blocks")?
        .as_array()?
        .iter()
        .map(|block| match block.as_str() {
            Some(text) => Value::String(visibility.prose(text, hidden)),
            None => Value::Bool(visibility.visible()),
        })
        .collect();
    Some(Value::Array(blocks))
}

// Older display rules match a bare opening tag. The template reads the original
// floor separately, so the single display marker can represent all its groups.
pub fn normalize_grouped_choices(mut source: &str) -> String {
    let mut output = String::with_capacity(source.len());
    while let Some(start) = source.find('<') {
        output.push_str(&source[..start]);
        source = &source[start..];
        if let Some(tag) = read_tag(source) {
            if tag.name.eq_ignore_ascii_case("fox_selc") && !tag.empty && source[..tag.end].ends_with('>') {
                output.push_str(if tag.closing { "</fox_selc>" } else { "<fox_selc>" });
            } else {
                output.push_str(&source[..tag.end]);
            }
            source = &source[tag.end..];
        } else {
            output.push('<');
            source = &source[1..];
        }
    }
    output.push_str(source);
    output
}

pub fn fox_thought_text(source: &str) -> &str {
    let text = source.trim_start();
    if text.starts_with('<') && let Some(tag) = read_tag(text) && !tag.closing {
        let name = tag.name.to_ascii_lowercase();
        if matches!(name.trim_end_matches('~'), "thinkfox" | "think_fox") {
            return text[tag.end..].trim_start();
        }
    }
    source
}
