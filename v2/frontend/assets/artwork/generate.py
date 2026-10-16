#!/usr/bin/env python3
"""Generate the Space Boxes V2 character-system SVG prototypes.

Original vector artwork created for owner evaluation (no approval yet).
The character: a warm gold human head whose open crown holds a physical
kraft box. Five session states plus the Extra/subtask active badge are
composed from shared parts below so every asset stays consistent.

All head states share one viewBox and one geometry, so swapping the asset
for a different session state never shifts layout. Static SVG only: no
animation, no scripts, no external references, per the static-asset
boundary in ../../ARTWORK-INTEGRATION.md.

Run:  python3 generate.py   (writes the SVG files next to this script)
"""

import hashlib
import math
import pathlib

HERE = pathlib.Path(__file__).resolve().parent

# Palette shared with the planner interface (css/planner.css custom properties).
INK = "#182c3d"        # --ink, all outlines
GOLD = "#f4bc55"       # head base
GOLD_SHADE = "#e0a238" # head shade / rim / lid depth
OPENING = "#4e2f16"    # box/head interior darkness
MOUTH = "#5b3a21"      # open-mouth interior
KRAFT = "#e3b271"      # box front faces
KRAFT_MID = "#c89055"  # box lid depth
KRAFT_DARK = "#a9743f" # open flaps
TAPE = "#f2e3bd"       # closed-box tape
CUBE_TOP = {1: "#5b93c4", 2: "#f09a5b", 3: "#d6c493"}
TASK = {1: "#3e7cb8", 2: "#e8823c", 3: "#c9b37e"}  # slot/task identity colors
TASK_DARK = {1: "#2c5f8f", 2: "#c2672b", 3: "#a89563"}
ORBIT = "#9ec1dd"      # single focus "space link" ring
CHECK = "#2f7d46"      # completion check (matches existing outcome styling)
BLUSH = "#ef9d4b"

# One canvas for every head state: content coordinates never move between states.
CANVAS = "0 -40 480 500"
STROKE = 10            # primary outline weight on the 480 canvas


def svg(view, size, body):
    width, height = size
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{view}" '
        f'width="{width}" height="{height}">\n'
        f'  <g stroke="{INK}" stroke-linecap="round" stroke-linejoin="round" fill="none">\n'
        f"{body}\n  </g>\n</svg>\n"
    )


def el(tag, attrs):
    keys = "".join(f' {k.replace("_", "-")}="{v}"' for k, v in attrs.items() if v is not None)
    return f"    <{tag}{keys}/>"


def spark(x, y, s, color):
    """Small four-point sparkle."""
    q = s * 0.22
    d = (f"M{x},{y - s} Q{x + q},{y - q} {x + s},{y} Q{x + q},{y + q} {x},{y + s} "
         f"Q{x - q},{y + q} {x - s},{y} Q{x - q},{y - q} {x},{y - s} Z")
    return el("path", {"d": d, "fill": color, "stroke_width": 5})


def star5(x, y, r, color=GOLD_SHADE):
    pts = []
    for i in range(10):
        rad = r if i % 2 == 0 else r * 0.45
        a = -math.pi / 2 + i * math.pi / 5
        pts.append(f"{x + rad * math.cos(a):.1f},{y + rad * math.sin(a):.1f}")
    return el("polygon", {"points": " ".join(pts), "fill": color, "stroke_width": 6})


def cube(cx, cy, s, i, num=None):
    """Axonometric task cube for slot/task identity."""
    d = s * 0.32
    opacity = 1
    parts = [
        el("polygon", {"points": f"{cx - s / 2},{cy - s / 2} {cx - s / 2 + d},{cy - s / 2 - d} "
                                 f"{cx + s / 2 + d},{cy - s / 2 - d} {cx + s / 2},{cy - s / 2}",
                       "fill": CUBE_TOP[i], "stroke_width": 7, "opacity": opacity}),
        el("polygon", {"points": f"{cx + s / 2},{cy - s / 2} {cx + s / 2 + d},{cy - s / 2 - d} "
                                 f"{cx + s / 2 + d},{cy + s / 2 - d} {cx + s / 2},{cy + s / 2}",
                       "fill": TASK_DARK[i], "stroke_width": 7, "opacity": opacity}),
        el("rect", {"x": round(cx - s / 2), "y": round(cy - s / 2), "width": s, "height": s,
                    "rx": 6, "fill": TASK[i], "stroke_width": 7, "opacity": opacity}),
    ]
    if num is not None:
        parts.append(
            f'    <text x="{cx + s * 0.06}" y="{cy + s * 0.30}" text-anchor="middle" '
            f'font-family="system-ui, sans-serif" font-size="{int(s * 0.52)}" '
            f'font-weight="700" fill="#ffffff" stroke="none" opacity="{opacity}">{num}</text>'
        )
    return "\n".join(parts)


def empty_slot(cx, cy, w, h):
    """Light dashed outline so the free slot reads inside the dark interior."""
    return "\n".join([
        el("rect", {"x": cx - w / 2, "y": cy - h / 2, "width": w, "height": h,
                    "rx": 9, "stroke": TAPE, "stroke_width": 6,
                    "stroke_dasharray": "10 9", "stroke_opacity": 0.85}),
        el("path", {"d": f"M{cx - 9},{cy} h18 M{cx},{cy - 9} v18",
                    "stroke": TAPE, "stroke_width": 6, "stroke_opacity": 0.85}),
    ])


def head():
    """Ears, neck, head body with the cut crown rim and dark opening."""
    return "\n".join([
        el("circle", {"cx": 92, "cy": 258, "r": 20, "fill": GOLD}),
        el("circle", {"cx": 388, "cy": 258, "r": 20, "fill": GOLD}),
        el("path", {"d": "M212,380 h56 v46 q0,10 -10,10 h-36 q-10,0 -10,-10 Z", "fill": GOLD_SHADE}),
        el("path", {"d": "M90,150 L90,300 Q90,390 180,390 L300,390 Q390,390 390,300 "
                         "L390,150 Q390,118 340,112 L140,112 Q90,118 90,150 Z",
                    "fill": GOLD, "stroke_width": STROKE}),
        el("ellipse", {"cx": 240, "cy": 116, "rx": 120, "ry": 26, "fill": GOLD_SHADE, "stroke_width": STROKE}),
        el("ellipse", {"cx": 240, "cy": 113, "rx": 100, "ry": 19, "fill": OPENING, "stroke": "none"}),
    ])


def rim_front():
    """Crescent of rim in front of the box so it reads as sunk into the head."""
    return "\n".join([
        el("path", {"d": "M120,116 A120,26 0 0 0 360,116 A116,22 0 0 1 128,114 Z",
                    "fill": GOLD_SHADE, "stroke": "none"}),
        el("path", {"d": "M120,116 A120,26 0 0 0 360,116", "stroke_width": STROKE}),
    ])


def face(brows, eyes, mouth):
    return "\n".join([
        brows,
        el("ellipse", {"cx": 156, "cy": 306, "rx": 20, "ry": 12, "fill": BLUSH,
                       "fill_opacity": 0.45, "stroke": "none"}),
        el("ellipse", {"cx": 324, "cy": 306, "rx": 20, "ry": 12, "fill": BLUSH,
                       "fill_opacity": 0.45, "stroke": "none"}),
        eyes,
        mouth,
    ])


def brows(kind):
    return {
        "neutral": "\n".join([
            el("path", {"d": "M176,220 Q192,212 208,219", "stroke_width": 9}),
            el("path", {"d": "M272,219 Q288,212 304,220", "stroke_width": 9})]),
        "keen": "\n".join([
            el("path", {"d": "M176,212 Q192,202 208,210", "stroke_width": 9}),
            el("path", {"d": "M272,210 Q288,202 304,212", "stroke_width": 9})]),
        "focus": "\n".join([
            el("path", {"d": "M176,206 Q192,196 208,204", "stroke_width": 9}),
            el("path", {"d": "M272,214 Q288,210 304,216", "stroke_width": 9})]),
        "calm": "\n".join([
            el("path", {"d": "M178,226 Q192,221 206,225", "stroke_width": 9}),
            el("path", {"d": "M274,225 Q288,221 302,226", "stroke_width": 9})]),
    }[kind]


def eyes(kind):
    if kind == "open":
        return "\n".join([
            el("ellipse", {"cx": 194, "cy": 260, "rx": 13, "ry": 17, "fill": INK, "stroke": "none"}),
            el("ellipse", {"cx": 286, "cy": 260, "rx": 13, "ry": 17, "fill": INK, "stroke": "none"})])
    if kind == "narrow":
        return "\n".join([
            el("ellipse", {"cx": 194, "cy": 261, "rx": 14, "ry": 9, "fill": INK, "stroke": "none"}),
            el("ellipse", {"cx": 286, "cy": 261, "rx": 14, "ry": 9, "fill": INK, "stroke": "none"})])
    if kind == "closed":
        return "\n".join([
            el("path", {"d": "M180,258 Q194,270 208,258", "stroke_width": 9}),
            el("path", {"d": "M272,258 Q286,270 300,258", "stroke_width": 9})])
    if kind == "happy":
        return "\n".join([
            el("path", {"d": "M178,264 Q194,246 210,264", "stroke_width": 9}),
            el("path", {"d": "M270,264 Q286,246 302,264", "stroke_width": 9})])
    raise ValueError(kind)


def mouth(kind):
    if kind == "smile":
        return el("path", {"d": "M224,336 Q240,348 256,336", "stroke_width": 9})
    if kind == "small-o":
        return el("ellipse", {"cx": 240, "cy": 340, "rx": 10, "ry": 12, "fill": MOUTH, "stroke_width": 7})
    if kind == "breath":
        return "\n".join([
            el("path", {"d": "M230,338 Q240,344 250,338", "stroke_width": 8}),
            el("path", {"d": "M170,344 q-10,4 -14,12", "stroke_width": 6, "stroke_opacity": 0.6}),
            el("path", {"d": "M186,352 q-8,3 -11,9", "stroke_width": 6, "stroke_opacity": 0.6})])
    if kind == "cheer":
        return el("path", {"d": "M210,326 Q240,370 270,326 Q240,340 210,326 Z",
                           "fill": MOUTH, "stroke_width": 8})
    raise ValueError(kind)


def closed_box(checked=False):
    """Taped-shut box nested in the crown."""
    parts = [
        el("rect", {"x": 150, "y": 52, "width": 180, "height": 76, "rx": 8,
                    "fill": KRAFT, "stroke_width": STROKE}),
        el("polygon", {"points": "150,52 164,36 316,36 330,52", "fill": KRAFT_MID, "stroke_width": 8}),
        el("rect", {"x": 226, "y": 36, "width": 28, "height": 92, "fill": TAPE, "stroke_width": 7}),
    ]
    if checked:
        parts.append(el("path", {"d": "M222,80 L238,96 L262,62", "stroke": CHECK, "stroke_width": 11}))
    return "\n".join(parts)


def open_box(filled):
    """Box with flaps open: three numbered slots; `filled` shows task cubes."""
    parts = [
        el("rect", {"x": 150, "y": 46, "width": 180, "height": 72, "rx": 10, "fill": OPENING, "stroke": "none"}),
        el("polygon", {"points": "150,50 112,14 146,6 176,44", "fill": KRAFT_DARK, "stroke_width": 8}),
        el("polygon", {"points": "330,50 368,14 334,6 304,44", "fill": KRAFT_DARK, "stroke_width": 8}),
    ]
    for i, cx in enumerate((184, 240, 296), start=1):
        if filled >= i:
            parts.append(cube(cx, 82, 32, i, num=i))
        else:
            parts.append(empty_slot(cx, 82, 46, 42))
    parts.append(el("rect", {"x": 136, "y": 100, "width": 208, "height": 30, "rx": 10,
                             "fill": KRAFT, "stroke_width": 8}))
    return "\n".join(parts)


# ---------------------------------------------------------------------------
# State compositions
# ---------------------------------------------------------------------------

def idle():
    return svg(CANVAS, (480, 500), "\n".join([
        head(),
        closed_box(),
        rim_front(),
        face(brows("neutral"), eyes("open"), mouth("smile")),
    ]))


def planning(filled):
    return svg(CANVAS, (480, 500), "\n".join([
        head(),
        open_box(filled=filled),
        rim_front(),
        face(brows("keen"), eyes("open"), mouth("smile") if filled else mouth("small-o")),
    ]))


def focus(k, n):
    """Active Primary session: task k's cube released, other planned work docked."""
    parts = [head()]
    parts.append(el("rect", {"x": 150, "y": 46, "width": 180, "height": 72, "rx": 10, "fill": OPENING, "stroke": "none"}))
    parts.append(el("polygon", {"points": "150,50 112,14 146,6 176,44", "fill": KRAFT_DARK, "stroke_width": 8}))
    parts.append(el("polygon", {"points": "330,50 368,14 334,6 304,44", "fill": KRAFT_DARK, "stroke_width": 8}))
    for i, cx in enumerate((184, 240, 296), start=1):
        if i == k:
            parts.append(empty_slot(cx, 82, 46, 42))
            parts.append(el("path", {"d": f"M{cx},62 L{cx},48 M{cx},48 l-6,7 M{cx},48 l6,7",
                                     "stroke": TAPE, "stroke_width": 6}))
        elif i <= n:
            parts.append(cube(cx, 82, 32, i, num=i))
        else:
            parts.append(empty_slot(cx, 82, 46, 42))
    parts.append(el("rect", {"x": 136, "y": 100, "width": 208, "height": 30, "rx": 10,
                             "fill": KRAFT, "stroke_width": 8}))
    parts.append(rim_front())
    # The single space link: one thin orbit ring plus three quiet sparkles.
    parts.append(el("ellipse", {"cx": 240, "cy": 4, "rx": 62, "ry": 20, "stroke": ORBIT,
                                "stroke_width": 6, "transform": "rotate(-14 240 4)"}))
    parts.append(cube(240, 4, 40, k, num=k))
    parts.append(spark(154, -8, 9, ORBIT))
    parts.append(spark(330, -16, 8, ORBIT))
    parts.append(spark(344, 58, 6, ORBIT))
    parts.append(face(brows("focus"), eyes("narrow"), mouth("smile")))
    return svg(CANVAS, (480, 500), "\n".join(parts))


def pause(n):
    """Paused Primary session: planned work tucked under the half-closed lid."""
    parts = [
        head(),
        el("rect", {"x": 150, "y": 46, "width": 180, "height": 72, "rx": 10, "fill": OPENING, "stroke": "none"}),
        el("polygon", {"points": "150,50 112,14 146,6 176,44", "fill": KRAFT_DARK, "stroke_width": 8}),
        el("polygon", {"points": "330,50 368,14 334,6 304,44", "fill": KRAFT_DARK, "stroke_width": 8}),
    ]
    for i, cx in enumerate((184, 240, 296), start=1):
        if i <= n:
            parts.append(cube(cx, 82, 32, i, num=i))
        else:
            parts.append(empty_slot(cx, 82, 46, 42))
    # half-closed lid over the cubes: the resting cue, in shape not color
    parts.append(el("rect", {"x": 136, "y": 74, "width": 208, "height": 32, "rx": 10,
                             "fill": KRAFT, "stroke_width": 8}))
    parts.append(rim_front())
    # hand-drawn pause bars above the right flap: second non-color cue
    parts.append(el("rect", {"x": 330, "y": -8, "width": 9, "height": 26, "rx": 4,
                             "fill": INK, "stroke": "none", "transform": "rotate(8 334 5)"}))
    parts.append(el("rect", {"x": 349, "y": -8, "width": 9, "height": 26, "rx": 4,
                             "fill": INK, "stroke": "none", "transform": "rotate(8 353 5)"}))
    parts.append(face(brows("calm"), eyes("closed"), mouth("breath")))
    return svg(CANVAS, (480, 500), "\n".join(parts))


def complete():
    parts = [head(), closed_box(checked=True), rim_front()]
    parts.append(star5(332, 8, 26))
    parts.append(el("circle", {"cx": 150, "cy": 32, "r": 7, "fill": TASK[2], "stroke": "none"}))
    parts.append(el("circle", {"cx": 188, "cy": 6, "r": 5, "fill": INK, "stroke": "none"}))
    parts.append(face(brows("neutral"), eyes("happy"), mouth("cheer")))
    return svg(CANVAS, (480, 500), "\n".join(parts))


def extra_active():
    """Active Extra/subtask badge: a targeted cube, clearly not a fourth head box."""
    parts = [
        el("circle", {"cx": 180, "cy": 118, "r": 78, "stroke_width": 6,
                      "stroke_dasharray": "12 10", "stroke_opacity": 0.5}),
    ]
    for x, y in ((88, 42), (272, 42), (88, 194), (272, 194)):
        sx = 1 if x < 180 else -1
        sy = 1 if y < 118 else -1
        parts.append(el("path", {"d": f"M{x + sx * 26},{y} h{-sx * 12} M{x},{y + sy * 26} v{-sy * 12}",
                                 "stroke_width": 8}))
    parts.append(cube(180, 118, 58, 1))
    parts.append(spark(262, 66, 10, GOLD_SHADE))
    parts.append(spark(96, 170, 8, GOLD_SHADE))
    return svg("0 0 360 236", (360, 236), "\n".join(parts))


FILES = {
    "sb-head-idle.svg": idle(),
    "sb-head-planning-0.svg": planning(0),
    "sb-head-planning-1.svg": planning(1),
    "sb-head-planning-2.svg": planning(2),
    "sb-head-planning-3.svg": planning(3),
    # Active-session variants bind the released cube to the active task's slot
    # (k) within the day's planned count (n): no stale-position association.
    **{f"sb-head-focus-{k}-of-{n}.svg": focus(k, n)
       for n in (1, 2, 3) for k in range(1, n + 1)},
    **{f"sb-head-pause-{n}.svg": pause(n) for n in (1, 2, 3)},
    "sb-head-complete.svg": complete(),
    "sb-extra-active.svg": extra_active(),
}


def main():
    for name, body in FILES.items():
        path = HERE / name
        path.write_text(body, encoding="utf-8")
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        print(f"{name}  sha256:{digest}")


if __name__ == "__main__":
    main()
