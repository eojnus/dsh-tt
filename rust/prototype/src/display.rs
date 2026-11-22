use serde_json::Value;

fn escape_html(text: &str, output: &mut String) {
    for character in text.chars() {
        match character {
            '&' => output.push_str("&amp;"),
            '<' => output.push_str("&lt;"),
            '>' => output.push_str("&gt;"),
            _ => output.push(character),
        }
    }
}

fn write_data_tree(nodes: &[Value], output: &mut String, depth: usize) -> Option<()> {
    if depth > 64 {
        return None;
    }
    for node in nodes {
        if let Some(text) = node.as_str() {
            escape_html(text, output);
            continue;
        }
        let name = node["name"].as_str()?;
        if name == "br" {
            output.push_str("<br>");
            continue;
        }
        let children = node["children"].as_array()?;
        let keep_tag = matches!(name, "option" | "q" | "simple_thinking");
        if keep_tag {
            output.push('<');
            output.push_str(name);
            output.push('>');
        }
        write_data_tree(children, output, depth + 1)?;
        if keep_tag {
            output.push_str("</");
            output.push_str(name);
            output.push('>');
        }
    }
    Some(())
}

pub fn encode_capture(input: &Value) -> Option<String> {
    let mut output = String::new();
    match input["kind"].as_str()? {
        "tree" => write_data_tree(input["value"].as_array()?, &mut output, 0)?,
        "text" => escape_html(input["value"].as_str()?, &mut output),
        "fox-thought" => escape_html(crate::message::fox_thought_text(input["value"].as_str()?), &mut output),
        // Encode a JS string literal and neutralize the HTML raw-text terminator.
        "script" => {
            let literal = serde_json::to_string(input["value"].as_str()?).ok()?;
            output = literal.replace('<', "\\u003c").replace('\u{2028}', "\\u2028")
                .replace('\u{2029}', "\\u2029");
        }
        _ => return None,
    }
    Some(output)
}
