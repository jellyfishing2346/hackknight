"""
Wire Tabby AI into the home page (app/page.tsx) with a few small, checked edits.
Safe to run more than once: it does nothing if Tabby AI is already wired in.
Run from the project folder:  python3 scripts/add-tabby-ai.py
"""
import re, sys

PATH = "app/page.tsx"
s = open(PATH).read()

if "TabbyAI" in s:
    print("Tabby AI is already wired into app/page.tsx. Nothing to do.")
    sys.exit(0)

problems = []

# 1) Import, right after the last import line at the top of the file.
imports = list(re.finditer(r'^import .*;\s*$', s, flags=re.M))
if not imports:
    problems.append("couldn't find the import lines")
else:
    end = imports[-1].end()
    s = s[:end] + '\nimport { TabbyAI, type TabbyDraft } from "@/app/components/TabbyAI";' + s[end:]

# 2) A small function that loads Tabby AI's bill into the review screen.
if "function load(" not in s:
    problems.append("couldn't find the load() function")
lines = [
    "  /** Load a bill from Tabby AI into the review screen. */",
    "  function applyAiDraft(d: TabbyDraft) {",
    '    load({ merchant: d.merchant || "Dinner", items: d.items, tax: d.tax, tip: d.tip });',
    "    if (d.hostName) setHostName(d.hostName);",
]
if "setSplitMode" in s and "setPeople" in s:
    lines += [
        '    if (d.splitMode === "even" && d.people >= 2) {',
        '      setSplitMode("even");',
        "      setPeople(d.people);",
        "    } else {",
        '      setSplitMode("items");',
        "    }",
    ]
lines += ["  }", ""]
fn = "\n".join(lines) + "\n"
anchor = re.search(r"^  (async )?function (reset|start)\(", s, flags=re.M)
if not anchor:
    problems.append("couldn't find where to add applyAiDraft()")
else:
    s = s[: anchor.start()] + fn + s[anchor.start():]

# 3) The Tabby AI button on the home screen: just before the last </main> in the file.
i = s.rfind("</main>")
if i == -1:
    problems.append("couldn't find </main>")
else:
    line_start = s.rfind("\n", 0, i) + 1
    indent = s[line_start:i]
    s = s[:line_start] + indent + "  <TabbyAI onUse={applyAiDraft} />\n" + s[line_start:]

if problems:
    print("Nothing changed. Problems: " + "; ".join(problems) + ". Send this message to Claude.")
    sys.exit(1)

open(PATH, "w").write(s)
print("Tabby AI wired into app/page.tsx.")
