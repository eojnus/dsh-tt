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
