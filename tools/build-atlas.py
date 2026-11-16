"""把 Overpass 下載的資料轉成「純地圖」場域包用的 atlas.js（座標已換成公尺，X 向東、Y 向北）。

用法：python3 tools/build-atlas.py raw.json data/atlas.js 中心緯度 中心經度 半寬 半高
需要 shapely（pip install shapely）。
raw.json 的取得方式（Overpass QL，範圍比地圖大一圈）：
  [out:json];(way["building"](範圍);way["highway"](範圍);way["natural"](範圍);way["waterway"](範圍);
  way["leisure"](範圍);way["landuse"](範圍);relation["natural"="water"](範圍);node["natural"="tree"](範圍););out body geom;
"""
import json, math, random, sys
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import linemerge, polygonize, unary_union
from shapely.prepared import prep

raw = json.load(open(sys.argv[1], encoding="utf-8"))
LAT0, LNG0, HW, HH = [float(v) for v in sys.argv[3:7]]
KX, KY = 111320 * math.cos(math.radians(LAT0)), 110540
FRAME = box(-HW, -HH, HW, HH)
random.seed(7)

def xy(p):
    return ((p["lon"] - LNG0) * KX, (p["lat"] - LAT0) * KY)

def line(geom):
    return [xy(p) for p in geom]

def poly(geom):
    pts = line(geom)
    if len(pts) < 4 or pts[0] != pts[-1]:
        return None
    p = Polygon(pts)
    if not p.is_valid:
        p = p.buffer(0)
    return p if not p.is_empty else None

def r1(v):
    return round(v, 1)

def rings(g, tol=0.4):
    """把（多）多邊形攤平成 [[外框, 洞, 洞…], …]，順便簡化、裁到圖框裡。"""
    g = g.intersection(FRAME).simplify(tol)
    out = []
    for p in getattr(g, "geoms", [g]):
        if p.geom_type != "Polygon" or p.area < 4:
            continue
        out.append([[[r1(x), r1(y)] for x, y in r.coords[:-1]] for r in [p.exterior, *p.interiors] if len(r.coords) > 3])
    return out

# 道路：分四級，數字是半寬（公尺）
ROAD = {
    "trunk": ("major", 6), "trunk_link": ("major", 4), "primary": ("major", 7), "primary_link": ("major", 4),
    "secondary": ("major", 6), "secondary_link": ("major", 4),
    "tertiary": ("minor", 4.5), "tertiary_link": ("minor", 3.5), "residential": ("minor", 3), "unclassified": ("minor", 3),
    "living_street": ("minor", 2.5),
    "service": ("lane", 1.8), "pedestrian": ("lane", 2), "track": ("lane", 1.6),
    "footway": ("foot", 0.9), "path": ("foot", 0.9), "steps": ("foot", 0.9), "cycleway": ("foot", 1.2),
}
# 分析模式用的權重：車流看道路等級，人流看是不是給人走的路（都是推估，不是實測）
CARW = {"trunk": 3, "trunk_link": 1.6, "primary": 3, "primary_link": 1.6, "secondary": 2.4, "secondary_link": 1.4,
        "tertiary": 1.6, "tertiary_link": 1, "residential": 0.7, "unclassified": 0.7, "living_street": 0.4, "service": 0.25}
WALKW = {"footway": 1, "path": 0.6, "steps": 0.7, "pedestrian": 1.4, "living_street": 1, "residential": 0.8, "service": 0.5,
         "tertiary": 0.7, "unclassified": 0.7, "cycleway": 0.4}
flow = {"car": [], "walk": []}
WOOD = {"forest", "wood", "scrub"}
LAWN = {"grass", "meadow", "park", "garden", "grassland", "village_green", "recreation_ground", "farmland"}
HEIGHT = {"apartments": 22, "commercial": 16, "retail": 12, "office": 22, "university": 16, "dormitory": 18, "school": 13,
          "residential": 13, "house": 7, "industrial": 9, "warehouse": 7, "greenhouse": 3.5, "roof": 4, "temple": 8,
          "church": 11, "public": 12, "museum": 9, "hospital": 20}

road = {"major": [], "minor": [], "lane": [], "foot": []}
named = {}
water, wood, lawn, buildings, tree_pts, tree_rows, spans = [], [], [], [], [], [], []

for e in raw["elements"]:
    t = e.get("tags", {})
    if e["type"] == "node":
        if t.get("natural") == "tree":
            tree_pts.append(xy(e))
        continue
    if e["type"] == "relation":
        if t.get("natural") == "water":
            outer = [LineString(line(m["geometry"])) for m in e["members"] if m.get("geometry") and m.get("role") != "inner"]
            water += list(polygonize(unary_union(outer)))
        continue
    g = e.get("geometry")
    if not g:
        continue
    hw = t.get("highway")
    if hw in ROAD and t.get("tunnel") != "yes" and "indoor" not in t and t.get("footway") != "sidewalk":
        kind, half = ROAD[hw]
        pts = line(g)
        if t.get("bridge") in ("yes", "viaduct"):          # 高架橋與天橋另外處理，不畫在地面上
            lv = t.get("layer", "1")
            spans.append((LineString(pts), "foot" if kind == "foot" else "car", half, max(1, int(lv)) if lv.lstrip("-").isdigit() else 1, CARW.get(hw, 0)))
            continue
        if t.get("area") == "yes" or (hw == "pedestrian" and pts[0] == pts[-1] and len(pts) > 3):
            p = poly(g)
            if p:
                road["lane"].append(p)
            continue
        ls = LineString(pts)
        if hw in CARW:
            flow["car"].append((CARW[hw], ls))
        if hw in WALKW:
            flow["walk"].append((WALKW[hw], ls))
        road[kind].append(ls.buffer(half, cap_style=1, join_style=1, resolution=3))
        if kind in ("major", "minor") and t.get("name"):
            named.setdefault(t["name"], []).append(ls)
        continue
    if t.get("natural") == "tree_row":
        tree_rows.append(LineString(line(g)))
        continue
    p = poly(g)
    if not p:
        continue
    if "building" in t:
        if not FRAME.contains(p.centroid) or p.area < 12:
            continue
        kind = t["building"]
        h = None
        try:
            h = float(str(t.get("height", "")).replace("m", ""))
        except ValueError:
            pass
        lv = t.get("building:levels", "")
        if h is None and lv.replace(".", "", 1).isdigit() and float(lv) > 0:
            h = float(lv) * 3.2 + 1
        if h is None:
            h = HEIGHT.get(kind, 10 + (e["id"] % 4) * 3)
        outer = p.simplify(0.3)
        if outer.geom_type != "Polygon":
            continue
        buildings.append({"p": [[r1(x), r1(y)] for x, y in outer.exterior.coords[:-1]], "h": r1(min(h, 70)),
                          "k": kind, "n": t.get("name", "")})
    elif t.get("natural") == "water" or t.get("landuse") in ("basin", "reservoir"):
        water.append(p)
    elif t.get("natural") in WOOD or t.get("landuse") in WOOD:
        wood.append(p)
    elif t.get("leisure") in LAWN or t.get("landuse") in LAWN or t.get("natural") in LAWN:
        lawn.append(p)
    elif t.get("leisure") == "pitch" and t.get("surface", "grass") in ("grass", "artificial_turf"):
        lawn.append(p)

U = lambda parts: unary_union([p for p in parts if p.is_valid and p.intersects(FRAME)]).intersection(FRAME)
water_u, wood_u = U(water), U(wood)
major_u, minor_u, lane_u, foot_u = U(road["major"]), U(road["minor"]), U(road["lane"]), U(road["foot"])
wood_u = wood_u.difference(water_u)
lawn_u = U(lawn).difference(water_u).difference(wood_u)
built_u = unary_union([Polygon(b["p"]).buffer(1.5) for b in buildings])
# 圖資上沒標、但離建築和馬路都有一段距離的大片空地，當成樹林（公館這一帶多半是山坡與河岸的綠地）
open_u = FRAME.difference(unary_union([built_u.buffer(9), major_u.buffer(4), minor_u.buffer(4), lane_u.buffer(2),
                                       water_u.buffer(2), lawn_u, wood_u])).buffer(-7).buffer(7)
wood_u = unary_union([wood_u] + [g for g in getattr(open_u, "geoms", [open_u]) if g.area > 1800]).intersection(FRAME)
lawn_u = lawn_u.difference(wood_u)
span_u = unary_union([sp[0].buffer(sp[2] + 4) for sp in spans]) if spans else Polygon()      # 橋下不種樹，免得樹穿出橋面
blocked = prep(unary_union([built_u, major_u, minor_u, lane_u.buffer(0.5), water_u, span_u]))

in_wood = prep(wood_u)
# 山形：把樹林一圈一圈往內縮，每縮一圈疊高一層，像等高線模型。避開建築與馬路，房子才不會被埋住
hills, hill_steps = [], []
hill_base = wood_u.difference(unary_union([built_u.buffer(5), major_u.buffer(2), minor_u.buffer(2), span_u]))
for level in range(1, 13):
    step = hill_base.buffer(-(3 + 7 * (level - 1)), join_style=1).buffer(0)
    shape = rings(step, 1.0)
    if not shape:
        break
    hills.append(shape)
    hill_steps.append(prep(step))

# 樹：圖資上的單株、行道樹每 9 公尺一棵，再往樹林與草地裡撒
trees = []
def plant(x, y, scale=1.0):
    if abs(x) < HW - 4 and abs(y) < HH - 4 and not blocked.contains(Point(x, y)):
        trees.append([r1(x), r1(y), round(scale * random.uniform(0.75, 1.3), 2), random.randrange(6),
                      1 if in_wood.contains(Point(x, y)) else 0,       # 這棵樹是不是在樹林裡
                      sum(1 for st in hill_steps if st.contains(Point(x, y)))])   # 站在山形的第幾層（0 是平地）

for x, y in tree_pts:
    plant(x, y)
for row in tree_rows:
    d = 0
    while d <= row.length:
        q = row.interpolate(d)
        plant(q.x, q.y)
        d += 9

def scatter(area, step, keep, scale):
    pa = prep(area)
    y = -HH
    while y < HH:
        x = -HW
        while x < HW:
            px, py = x + random.uniform(0, step), y + random.uniform(0, step)
            if random.random() < keep and pa.contains(Point(px, py)):
                plant(px, py, scale)
            x += step
        y += step

scatter(wood_u, 12, 0.85, 1.15)
scatter(lawn_u, 20, 0.5, 0.95)
edge = major_u.buffer(3)                                   # 大馬路兩側的行道樹
for g in getattr(edge, "geoms", [edge]):
    for ring in [g.exterior, *g.interiors]:
        d = 0
        while d < ring.length:
            q = ring.interpolate(d)
            plant(q.x, q.y, 0.85)
            d += 22

# 橋：每一段橋各自成一條帶子。高度依 layer；兩段橋接在同一個點上時，那個點取兩邊的平均，
# 再沿著橋身慢慢過渡，接頭才不會有落差。沒接到別的橋、也沒出圖框的那一端做成下坡接回地面。
bridges, ways, joints = [], [], {}
edge_line = FRAME.exterior
smooth = lambda t: t * t * (3 - 2 * t)
for ls, cls, half, layer, fw in spans:
    cut = ls.intersection(FRAME)
    for piece in getattr(cut, "geoms", [cut]):
        if piece.geom_type == "LineString" and piece.length > 1:
            ways.append((piece, cls, half, layer * (7.0 if cls == "car" else 5.5), fw))
knot = lambda q, cls: (cls, round(q[0] * 2), round(q[1] * 2))
for ch, cls, half, z0, fw in ways:
    for q in (ch.coords[0], ch.coords[-1]):
        joints.setdefault(knot(q, cls), []).append(z0)
for ch, cls, half, z0, fw in ways:
    L = ch.length
    ends = []
    for q in (ch.coords[0], ch.coords[-1]):
        met = joints[knot(q, cls)]
        free = len(met) == 1 and edge_line.distance(Point(q)) > 8
        ends.append((0.0 if free else sum(met) / len(met), min((70 if cls == "car" else 16) if free else 45, L / 2)))
    n = max(2, int(L / 5) + 1)
    pts = []
    for k in range(n):
        d = L * k / (n - 1)
        q = ch.interpolate(d)
        wa = smooth(1 - d / ends[0][1]) if d < ends[0][1] else 0
        wb = smooth(1 - (L - d) / ends[1][1]) if L - d < ends[1][1] else 0
        pts.append([r1(q.x), r1(q.y), r1(z0 * (1 - wa - wb) + ends[0][0] * wa + ends[1][0] * wb)])
    bridges.append({"k": cls, "w": half, "f": fw, "p": pts})

# 流量用的中心線：裁到圖框裡、簡化，短的不要
flows = {}
for name, parts in flow.items():
    out_lines = []
    for wgt, ls in parts:
        cut = ls.intersection(FRAME).simplify(1.2)
        for piece in getattr(cut, "geoms", [cut]):
            if piece.geom_type == "LineString" and piece.length > 14:
                out_lines.append([wgt, [v for x, y in piece.coords for v in (r1(x), r1(y))]])
    flows[name] = out_lines

# 小人：撒在巷弄、步道與廣場上，越靠近圖的中心越多
walk = prep(unary_union([lane_u, foot_u.buffer(0.6), minor_u]).difference(built_u))
people = []
while len(people) < 320:
    x, y = random.gauss(0, HW * 0.42), random.gauss(0, HH * 0.42)
    if abs(x) < HW - 6 and abs(y) < HH - 6 and walk.contains(Point(x, y)):
        people.append([r1(x), r1(y), round(random.uniform(0.9, 1.15), 2), random.randrange(4)])
        if random.random() < 0.45:                         # 有些人結伴走
            people.append([r1(x + random.uniform(-1.6, 1.6)), r1(y + random.uniform(-1.6, 1.6)), round(random.uniform(0.85, 1.1), 2), random.randrange(4)])

# 路名：取圖框內最長的一段，放在中點，順著路的方向
labels = []
inner = box(-HW + 40, -HH + 40, HW - 40, HH - 40)
for name, parts in named.items():
    u = unary_union(parts)
    m = (linemerge(u) if u.geom_type == "MultiLineString" else u).intersection(inner)
    best = max(getattr(m, "geoms", [m]), key=lambda s: s.length, default=None)
    if best is None or best.geom_type != "LineString" or best.length < 120:
        continue
    mid, a, b = best.interpolate(0.5, normalized=True), best.interpolate(best.length / 2 - 20), best.interpolate(best.length / 2 + 20)
    labels.append({"n": name, "x": r1(mid.x), "y": r1(mid.y), "a": round(math.atan2(b.y - a.y, b.x - a.x), 3), "l": round(best.length)})

out = {
    "center": {"lat": LAT0, "lng": LNG0}, "half": [HW, HH],
    "water": rings(water_u, 0.8), "wood": rings(wood_u, 0.8), "lawn": rings(lawn_u, 0.5),
    "major": rings(major_u), "minor": rings(minor_u), "lane": rings(lane_u), "foot": rings(foot_u, 0.3),
    "buildings": buildings, "trees": trees, "people": people, "bridges": bridges, "flows": flows, "hills": hills, "labels": labels,
}
text = "// 由 tools/build-atlas.py 產生，資料 © OpenStreetMap contributors (ODbL)\n"
text += "window.ATLAS_DATA = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(sys.argv[2], "w", encoding="utf-8").write(text)
print({k: len(v) for k, v in out.items() if isinstance(v, list)}, {k: len(v) for k, v in flows.items()}, len(text) // 1024, "KB")
