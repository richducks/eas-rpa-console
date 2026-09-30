#!/usr/bin/env python3
import json
import sys
import time

import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi


def children(node):
    try:
        return [node.get_child_at_index(i) for i in range(node.get_child_count())]
    except Exception:
        return []


def walk(node, depth=0, limit=12):
    if depth > limit:
        return
    yield node
    for child in children(node):
        yield from walk(child, depth + 1, limit)


def role_name(node):
    try:
        return (node.get_role_name() or "").lower()
    except Exception:
        return ""


def name(node):
    try:
        return (node.get_name() or "").strip()
    except Exception:
        return ""


def process_id(node):
    try:
        return node.get_process_id()
    except Exception:
        return -1


def activate(node):
    try:
        action = node.get_action_iface()
        for index in range(action.get_n_actions()):
            action_name = (action.get_action_name(index) or "").lower()
            if action_name in ("click", "press", "activate", "open"):
                return bool(action.do_action(index))
    except Exception:
        return False
    return False


def strings_below(node):
    values = []
    for item in walk(node, limit=8):
        role = role_name(item)
        value = name(item)
        if value and any(token in role for token in ("list item", "menu item", "table row", "label", "text")):
            values.append(value)
    return values


def unique(values):
    result = []
    for value in values:
        value = value.strip()
        if value and value not in result:
            result.append(value)
    return result


def main():
    pid = int(sys.argv[1])
    title = sys.argv[2] if len(sys.argv) > 2 else ""
    desktop = Atspi.get_desktop(0)
    target = None
    for app in children(desktop):
        if process_id(app) != pid:
            continue
        for node in walk(app):
            if "frame" in role_name(node) and (not title or title in name(node)):
                target = node
                break
        target = target or app
        break
    if target is None:
        print(json.dumps({"ok": False, "code": "ATSP_WINDOW_NOT_FOUND"}, ensure_ascii=False))
        return 2

    combos = [node for node in walk(target) if "combo box" in role_name(node)]
    if not combos:
        print(json.dumps({"ok": False, "code": "DATACENTER_COMBO_NOT_FOUND"}, ensure_ascii=False))
        return 3

    candidates = []
    for index, combo in enumerate(combos):
        before = strings_below(combo)
        activate(combo)
        time.sleep(0.35)
        after = strings_below(target)
        values = unique(before + after)
        score = sum(3 for value in values if "eas" in value.lower()) + len(values)
        candidates.append((score, index, values))

    candidates.sort(reverse=True)
    values = candidates[0][2]
    excluded = {"语言", "数据中心", "用户名", "密码", "简体中文", "登录", "取消"}
    values = [value for value in values if value not in excluded and len(value) < 80]
    print(json.dumps({"ok": bool(values), "code": "OK" if values else "DATACENTER_OPTIONS_EMPTY", "dataCenters": values}, ensure_ascii=False))
    return 0 if values else 4


if __name__ == "__main__":
    raise SystemExit(main())
