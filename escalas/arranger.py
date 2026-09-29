"""Reglas de dificultad y generación de versiones simplificadas de una canción.

Las notas van por mano como [inicio, duración, nota MIDI], con inicio y duración en tiempos.
"""
BLACK = {1, 3, 6, 8, 10}

# Nivel básico: sin armadura ni alteraciones, nada más corto que una negra,
# una nota a la vez por mano y un registro con pocas líneas adicionales.
BASIC_RULES = {
    'min_duration': 1,
    'ranges': {'rh': (60, 81), 'lh': (40, 60)},   # Do4–La5 y Mi2–Do4
}
# Nivel intermedio generado: melodía y bajo, nada más corto que una corchea.
INTERMEDIATE_MIN_DURATION = 0.5


def basic_problems(notes, key_fifths):
    """Lista de motivos por los que una versión no es apta para el nivel básico."""
    problems = []
    if key_fifths != 0:
        problems.append('El nivel básico no lleva armadura (debe estar en Do mayor o La menor).')
    for hand, label in (('rh', 'derecha'), ('lh', 'izquierda')):
        events = notes.get(hand, [])
        lo, hi = BASIC_RULES['ranges'][hand]
        if any(m % 12 in BLACK for _, _, m in events):
            problems.append(f'La mano {label} tiene teclas negras (sostenidos o bemoles).')
        if any(d < BASIC_RULES['min_duration'] for _, d, _ in events):
            problems.append(f'La mano {label} tiene notas más cortas que una negra.')
        if any(not lo <= m <= hi for _, _, m in events):
            problems.append(f'La mano {label} tiene notas fuera del registro básico ({lo}–{hi}).')
        starts = [round(t, 3) for t, _, _ in events]
        if len(starts) != len(set(starts)):
            problems.append(f'La mano {label} toca varias notas a la vez.')
    return problems


def _num(x):
    return int(x) if float(x).is_integer() else round(x, 3)


def top_line(events):
    """La voz más aguda: una nota por inicio, sin solaparse con la siguiente."""
    by_t = {}
    for t, d, m in events:
        if t not in by_t or m > by_t[t][1]:
            by_t[t] = (d, m)
    starts = sorted(by_t)
    out = []
    for i, t in enumerate(starts):
        d, m = by_t[t]
        if i + 1 < len(starts):
            d = min(d, starts[i + 1] - t)
        out.append([t, d, m])
    return out


def simplify_rhythm(line, step):
    """Deja como mucho una nota por casilla de `step` tiempos (la primera) y la alarga hasta la siguiente."""
    kept, last_slot = [], None
    for t, d, m in line:
        slot = int(t // step)
        if slot == last_slot:
            continue
        kept.append([slot * step, d, m])
        last_slot = slot
    out = []
    for i, (t, d, m) in enumerate(kept):
        end = kept[i + 1][0] if i + 1 < len(kept) else t + max(d, step)
        out.append([_num(t), _num(max(step, round((end - t) / step) * step)), m])
    return out


def bass_line(events, slot):
    """La nota más grave de cada casilla de `slot` tiempos, sostenida toda la casilla."""
    by_slot = {}
    for t, d, m in events:
        s = int(t // slot)
        by_slot[s] = min(by_slot.get(s, 999), m)
    return [[_num(s * slot), _num(slot), m] for s, m in sorted(by_slot.items())]


def transpose_to_white(events, key_fifths):
    """Transporta a Do mayor/La menor y lleva cualquier tecla negra que quede a la blanca de abajo."""
    shift = -((7 * key_fifths) % 12)
    if shift < -6:
        shift += 12
    return [[t, d, m + shift - (1 if (m + shift) % 12 in BLACK else 0)] for t, d, m in events]


def fit_range(events, lo, hi):
    """Lleva la línea al registro: primero la mueve entera de octava (conserva su forma)
    y después corrige de octava las notas que aún queden fuera."""
    if events:
        shift = max(range(-36, 37, 12), key=lambda k: (sum(lo <= m + k <= hi for _, _, m in events), -abs(k)))
        events = [[t, d, m + shift] for t, d, m in events]
    out = []
    for t, d, m in events:
        while m < lo:
            m += 12
        while m > hi:
            m -= 12
        out.append([t, d, m])
    return out


def derive(notes, key_fifths, beats_per_bar, level):
    """Genera la versión de un nivel más fácil a partir de la versión completa.
    Devuelve (notas, armadura)."""
    melody = top_line(notes['rh']) if notes['rh'] else []
    if level == 2:
        half = beats_per_bar / 2 if beats_per_bar % 2 == 0 else beats_per_bar
        return {'rh': simplify_rhythm(melody, INTERMEDIATE_MIN_DURATION),
                'lh': bass_line(notes['lh'], half)}, key_fifths
    if level == 1:
        rh = simplify_rhythm(melody, BASIC_RULES['min_duration'])
        lh = bass_line(notes['lh'], beats_per_bar)
        rh = fit_range(transpose_to_white(rh, key_fifths), *BASIC_RULES['ranges']['rh'])
        lh = fit_range(transpose_to_white(lh, key_fifths), *BASIC_RULES['ranges']['lh'])
        return {'rh': rh, 'lh': lh}, 0
    return notes, key_fifths


# ---------- versiones a partir de una hoja guía (melodía + acordes) ----------
NOTE_PCS = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
CHORD_INTERVALS = {'': (0, 4, 7), 'm': (0, 3, 7), '7': (0, 4, 7, 10), 'm7': (0, 3, 7, 10), 'maj7': (0, 4, 7, 11),
                   'dim': (0, 3, 6), 'aug': (0, 4, 8), 'sus2': (0, 2, 7), 'sus4': (0, 5, 7)}


def midi_of(name):
    """'C4' → 60, 'F#4' → 66, 'Bb3' → 58."""
    acc = {'#': 1, 'b': -1}.get(name[1:-1], 0)
    return 12 * (int(name[-1]) + 1) + NOTE_PCS[name[0]] + acc


def chord_pcs(symbol):
    """'Em' → (4, [4, 7, 11]); acepta los mismos cifrados que los módulos de Banda."""
    root = NOTE_PCS[symbol[0]] + {'#': 1, 'b': -1}.get(symbol[1:2], 0)
    quality = symbol[2:] if symbol[1:2] in ('#', 'b') else symbol[1:]
    return root % 12, [(root + i) % 12 for i in CHORD_INTERVALS[quality]]


def lead_sheet(melody, chords, start=0):
    """melody: [(nombre o 'r', duración)]; chords: [(cifrado o None, duración)].
    Devuelve (melodía como [inicio, duración, nota], acordes como [inicio, duración, cifrado])."""
    mel, t = [], start
    for name, d in melody:
        if name != 'r':
            mel.append([_num(t), _num(d), midi_of(name)])
        t += d
    spans, t = [], 0
    for sym, d in chords:
        if sym:
            spans.append([_num(t), _num(d), sym])
        t += d
    return mel, spans


def _bass_root(pc, lo=43):
    """La fundamental en la octava del bajo, entre Sol2 y Fa#3."""
    return lo + (pc - lo) % 12


def arrange(melody, chords, beats_per_bar, level):
    """Versión de un nivel a partir de melodía y acordes:
    avanzado = melodía con segunda voz en los tiempos fuertes y bajo arpegiado;
    intermedio = melodía y la fundamental de cada acorde; básico = derive() del intermedio."""
    if level == 1:
        raise ValueError('El nivel básico se genera con derive() a partir del intermedio.')
    rh = [list(n) for n in melody]
    lh = []
    for t, d, sym in chords:
        root, pcs = chord_pcs(sym)
        bass = _bass_root(root)
        if level == 2:
            lh.append([t, d, bass])
            continue
        pattern = [bass, bass + 7, bass + 12, bass + 7] if beats_per_bar % 3 else [bass, bass + 7, bass + 12]
        for i in range(int(d)):
            lh.append([_num(t + i), 1, pattern[i % len(pattern)]])
    if level == 3:
        for t, d, m in melody:
            if d < 1 or t % beats_per_bar:
                continue
            chord = next((c for c in chords if c[0] <= t < c[0] + c[1]), None)
            if not chord:
                continue
            _, pcs = chord_pcs(chord[2])
            below = [m - k for k in range(3, 10) if (m - k) % 12 in pcs]
            if below:
                rh.append([t, d, below[0]])
    rh.sort(key=lambda n: (n[0], n[2]))
    return {'rh': rh, 'lh': lh}
