#!/usr/bin/env python3
"""街道細部：從同一份 OpenStreetMap 原始資料抽出羅斯福路的車道、公車專用道、斑馬線、公館夜市範圍。
用法：python tools/build-detail.py raw.json data/detail.js 25.0125 121.5348
輸出的座標跟 data/atlas.js 一樣，是以圖心為原點的公尺。"""
import json, math, sys

src, out, clat, clng = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4])
els = json.load(open(src))["elements"]
nodes = {e["id"]: e for e in els if e["type"] == "node"}
KX, KY = 111320 * math.cos(math.radians(clat)), 110540
xy = lambda n: [round((n["lon"] - clng) * KX, 1), round((n["lat"] - clat) * KY, 1)]
geom = lambda e: [xy(q) for q in (e.get("geometry") or [nodes[i] for i in e.get("nodes", []) if i in nodes])]

roads, bus, cross, night, school = [], [], [], [], []
for e in els:
    t = e.get("tags", {})
    if e["type"] != "way":
        continue
    p = geom(e)
    if len(p) < 2:
        continue
    name = t.get("name", "")
    if t.get("highway") == "primary" and "羅斯福路" in name:
        if "專用道" in name or t.get("bus") in ("designated", "yes"):
            bus.append(p)
        else:
            roads.append({"n": int(t.get("lanes", 3)), "p": p})
    elif t.get("footway") == "crossing":
        cross.append(p)
    elif name == "公館夜市":
        night.append(p)
    elif t.get("amenity") == "school" or t.get("building") == "school":
        school.append({"name": name, "p": p})

data = {"roads": roads, "bus": bus, "cross": cross, "night": night, "school": school}
open(out, "w").write("// 由 tools/build-detail.py 產生：羅斯福路車道、公車專用道、斑馬線、公館夜市範圍（OpenStreetMap）\nwindow.ATLAS_DETAIL = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print({k: len(v) for k, v in data.items()}, [s["name"] for s in school], night[:1])
