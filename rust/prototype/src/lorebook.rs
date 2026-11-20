use serde_json::{Value, json};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

struct Entry<'a> {
    content: &'a str,
    skip_key: &'a str,
    group: Option<&'a str>,
    group_weight: f64,
    order: f64,
    uid_order: Option<f64>,
    delay: f64,
    recursion_level: f64,
    sticky: f64,
    cooldown: f64,
    sticky_until: Option<f64>,
    cooldown_until: Option<f64>,
    probability: Option<f64>,
    blocked: bool,
    forced: bool,
    constant: bool,
    has_keys: bool,
    exclude_recursion: bool,
    prevent_recursion: bool,
    ignore_budget: bool,
}

impl<'a> Entry<'a> {
    fn read(value: &'a Value) -> Option<Self> {
        let flag = |key: &str| value[key].as_bool().unwrap_or(false);
        Some(Self {
            content: value["content"].as_str()?,
            skip_key: value["skipKey"].as_str()?,
            group: value["group"].as_str(),
            group_weight: value["groupWeight"].as_f64()?,
            order: value["order"].as_f64()?,
            uid_order: value["uidOrder"].as_f64(),
            delay: value["delay"].as_f64()?,
            recursion_level: value["recursionLevel"].as_f64()?,
            sticky: value["sticky"].as_f64()?,
            cooldown: value["cooldown"].as_f64()?,
            sticky_until: value["stickyUntil"].as_f64(),
            cooldown_until: value["cooldownUntil"].as_f64(),
            probability: value["probability"].as_f64(),
            blocked: flag("blocked"),
            forced: flag("forced"),
            constant: flag("constant"),
            has_keys: flag("hasKeys"),
            exclude_recursion: flag("excludeRecursion"),
            prevent_recursion: flag("preventRecursion"),
            ignore_budget: flag("ignoreBudget"),
        })
    }

    fn order_cmp(&self, other: &Self) -> Ordering {
        self.order
            .partial_cmp(&other.order)
            .unwrap_or(Ordering::Equal)
            .then_with(|| match (self.uid_order, other.uid_order) {
                (Some(a), Some(b)) => a.partial_cmp(&b).unwrap_or(Ordering::Equal),
                _ => Ordering::Equal,
            })
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
#[repr(u32)]
enum Activation {
    Sticky,
    Decorator,
    Constant,
    Key,
}

impl Activation {
    fn name(self) -> &'static str {
        match self {
            Self::Sticky => "sticky",
            Self::Decorator => "decorator",
            Self::Constant => "constant",
            Self::Key => "key",
        }
    }

    fn from_code(code: u32) -> Self {
        [Self::Sticky, Self::Decorator, Self::Constant, Self::Key][(code & 3) as usize]
    }
}

pub trait Matcher {
    fn start_round(&mut self, recursive_text: &str);
    /// -1: secondary test failed, 0: no key, 1: matched.
    fn match_entry(&mut self, index: usize) -> i32;
    fn random(&mut self) -> f64;
    fn legacy_sort(&mut self, candidates: &mut [u32], grouped: bool);
}

#[derive(Default)]
struct Skips {
    entries: Vec<(usize, String)>,
    seen: HashSet<String>,
}

impl Skips {
    fn record(&mut self, index: usize, entry: &Entry, reason: &str) {
        if self.seen.insert(format!("{}|{reason}", entry.skip_key)) {
            self.entries.push((index, reason.into()));
        }
    }
}

fn sort_candidates(
    candidates: &mut [(usize, Activation)],
    entries: &[Entry],
    grouped: bool,
    use_legacy_sort: bool,
    matcher: &mut impl Matcher,
) {
    if use_legacy_sort {
        let mut packed: Vec<_> = candidates
            .iter()
            .map(|&(index, by)| (index as u32) << 2 | by as u32)
            .collect();
        matcher.legacy_sort(&mut packed, grouped);
        for (candidate, code) in candidates.iter_mut().zip(packed) {
            *candidate = ((code >> 2) as usize, Activation::from_code(code));
        }
        return;
    }
    candidates.sort_by(|(a, by_a), (b, by_b)| {
        let (a, b) = (&entries[*a], &entries[*b]);
        let priority = if grouped {
            b.group_weight
                .partial_cmp(&a.group_weight)
                .unwrap_or(Ordering::Equal)
        } else {
            (*by_b == Activation::Sticky).cmp(&(*by_a == Activation::Sticky))
        };
        priority.then_with(|| a.order_cmp(b))
    });
}

fn choose_groups<'a>(
    entries: &[Entry<'a>],
    candidates: Vec<(usize, Activation)>,
    skips: &mut Skips,
    use_legacy_sort: bool,
    matcher: &mut impl Matcher,
) -> Vec<(usize, Activation)> {
    let mut grouped: Vec<(&str, Vec<(usize, Activation)>)> = Vec::new();
    let mut group_index = HashMap::new();
    let mut kept = Vec::new();
    for candidate in candidates {
        let (index, _) = candidate;
        if let Some(group) = entries[index].group {
            let slot = *group_index.entry(group).or_insert_with(|| {
                grouped.push((group, Vec::new()));
                grouped.len() - 1
            });
            grouped[slot].1.push(candidate);
        } else {
            kept.push(candidate);
        }
    }
    for (group, mut members) in grouped {
        sort_candidates(&mut members, entries, true, use_legacy_sort, matcher);
        kept.push(members[0]);
        for (index, _) in &members[1..] {
            // Same-round group losses are counted on each round.
            skips.entries.push((*index, format!("group:{group}")));
        }
    }
    kept
}

pub fn estimate_tokens(text: &str) -> f64 {
    let cjk = text.chars().filter(|&ch| ch as u32 >= 0x2e80).count();
    let rest = text.encode_utf16().count() - cjk;
    (cjk as f64 / 1.6 + rest as f64 / 3.6).ceil()
}

pub fn scan_windows(input: &Value) -> Option<Value> {
    let history = input["history"].as_array()?;
    let depths = input["depths"].as_array()?;
    let history: Vec<_> = history.iter().map(Value::as_str).collect::<Option<_>>()?;
    let mut windows = Vec::with_capacity(depths.len());
    for depth in depths {
        let depth = depth.as_f64()? as usize;
        let mut window = String::new();
        for message in history.iter().rev().take(depth) {
            if !window.is_empty() {
                window.push('\n');
            }
            window.push_str(message);
        }
        windows.push(window);
    }
    Some(json!(windows))
}

pub fn bucket_layout(input: &Value) -> Option<Value> {
    let mut positions = [const { Vec::<usize>::new() }; 8];
    let mut depth: Vec<(f64, &str, Vec<usize>)> = Vec::new();
    let mut outlets: Vec<(&str, Vec<usize>)> = Vec::new();
    for (index, item) in input.as_array()?.iter().enumerate() {
        let position = item[0].as_f64()?;
        if position == 4.0 {
            let at = item[1].as_f64()?;
            let role = item[2].as_str()?;
            if let Some(group) = depth
                .iter_mut()
                .find(|group| group.0 == at && group.1 == role)
            {
                group.2.push(index);
            } else {
                depth.push((at, role, vec![index]));
            }
        } else if position == 7.0
            && let Some(name) = item[3].as_str().filter(|name| !name.is_empty())
        {
            if let Some(group) = outlets.iter_mut().find(|group| group.0 == name) {
                group.1.push(index);
            } else {
                outlets.push((name, vec![index]));
            }
        } else {
            let slot = if position.fract() == 0.0 && (0.0..=7.0).contains(&position) {
                position as usize
            } else {
                7
            };
            positions[slot].push(index);
        }
    }
    for group in &mut positions {
        group.reverse();
    }
    for (_, _, group) in &mut depth {
        group.reverse();
    }
    for (_, group) in &mut outlets {
        group.reverse();
    }
    let depth: Vec<_> = depth.into_iter().map(|(_, _, indices)| indices).collect();
    Some(json!({ "positions": positions, "depth": depth, "outlets": outlets }))
}

pub fn activate(input: &Value, matcher: &mut impl Matcher) -> Option<Value> {
    let entries: Vec<_> = input["entries"]
        .as_array()?
        .iter()
        .map(Entry::read)
        .collect::<Option<_>>()?;
    let turn = input["turn"].as_f64()?;
    let budget = input["budget"].as_f64()?;
    let limit = input["maxRecursionSteps"].as_f64()?;
    let recursive = input["recursive"].as_bool()?;
    let use_legacy_sort = input["legacySort"].as_bool().unwrap_or(false);
    let mut used = vec![false; entries.len()];
    let mut touched = vec![false; entries.len()];
    let mut failed_probability = vec![false; entries.len()];
    let mut claimed_groups = HashSet::new();
    let mut activated = Vec::new();
    let mut skips = Skips::default();
    let mut tokens = 0.0;
    let mut overflowed = false;
    let mut recursion = 0;
    let mut recursive_text = String::new();
    let mut rounds = 0;

    loop {
        rounds += 1;
        matcher.start_round(&recursive_text);
        let mut candidates = Vec::new();
        for (index, entry) in entries.iter().enumerate() {
            if used[index] {
                continue;
            }
            let reason = if entry.blocked || entry.content.is_empty() {
                "decorator"
            } else {
                touched[index] = true;
                if entry.delay > 0.0 && turn < entry.delay {
                    "delay"
                } else if entry.cooldown_until.is_some_and(|until| until > turn) {
                    "cooldown"
                } else if let Some(group) =
                    entry.group.filter(|group| claimed_groups.contains(group))
                {
                    skips.record(index, entry, &format!("group:{group}"));
                    continue;
                } else if entry.recursion_level > recursion as f64 {
                    "delayUntilRecursion"
                } else {
                    let activation = if entry.sticky_until.is_some_and(|until| until >= turn) {
                        Activation::Sticky
                    } else if entry.forced {
                        Activation::Decorator
                    } else if entry.constant {
                        Activation::Constant
                    } else {
                        if recursion > 0 && entry.exclude_recursion {
                            skips.record(index, entry, "excludeRecursion");
                            continue;
                        }
                        if !entry.has_keys {
                            skips.record(index, entry, "no-keys");
                            continue;
                        }
                        match matcher.match_entry(index) {
                            1 => Activation::Key,
                            -1 => {
                                skips.record(index, entry, "secondary");
                                continue;
                            }
                            _ => continue,
                        }
                    };
                    candidates.push((index, activation));
                    continue;
                }
            };
            skips.record(index, entry, reason);
        }
        if candidates.is_empty() {
            break;
        }
        sort_candidates(&mut candidates, &entries, false, use_legacy_sort, matcher);
        let mut survivors = Vec::new();
        for (index, by) in choose_groups(&entries, candidates, &mut skips, use_legacy_sort, matcher)
        {
            let entry = &entries[index];
            if by != Activation::Sticky
                && let Some(probability) = entry.probability
            {
                if failed_probability[index] || matcher.random() * 100.0 > probability {
                    failed_probability[index] = true;
                    skips.record(index, entry, "probability");
                    continue;
                }
            }
            survivors.push((index, by));
        }
        let start = activated.len();
        for (index, by) in survivors {
            let entry = &entries[index];
            let cost = estimate_tokens(entry.content);
            if !entry.ignore_budget && (overflowed || tokens + cost > budget) {
                overflowed = true;
                skips.record(index, entry, "budget");
                continue;
            }
            tokens += cost;
            used[index] = true;
            activated.push((index, by.name()));
            if let Some(group) = entry.group {
                claimed_groups.insert(group);
            }
        }
        if activated.len() == start
            || !recursive
            || (limit > 0.0 && (recursion + 1) as f64 >= limit)
        {
            break;
        }
        let mut recursed = false;
        for (index, _) in &activated[start..] {
            if !entries[*index].prevent_recursion {
                recursive_text.push('\n');
                recursive_text.push_str(entries[*index].content);
                recursed = true;
            }
        }
        if !recursed {
            break;
        }
        recursion += 1;
        if rounds > 50 {
            break;
        }
    }

    let timers: Vec<_> = used
        .iter()
        .enumerate()
        .filter(|&(_, used)| *used)
        .filter_map(|(index, _)| {
            let entry = &entries[index];
            let sticky_until = (entry.sticky > 0.0).then_some(turn + entry.sticky);
            let cooldown_until =
                (entry.cooldown > 0.0).then_some(sticky_until.unwrap_or(turn) + entry.cooldown);
            (sticky_until.is_some() || cooldown_until.is_some()).then_some((
                index,
                sticky_until,
                cooldown_until,
            ))
        })
        .collect();
    Some(
        json!({ "activated": activated, "skipped": skips.entries, "touched": touched, "timers": timers,
        "tokens": tokens, "overflowed": overflowed, "recursion": recursion, "rounds": rounds }),
    )
}
