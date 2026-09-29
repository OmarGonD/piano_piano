"""Digitación automática para las canciones: qué dedo (1 = pulgar … 5 = meñique) usar en cada nota.

Un MIDI no trae dedos, así que se calculan: para cada mano se busca la secuencia de dedos de menor «esfuerzo»
(programación dinámica) con reglas de pianista: intervalos que cada par de dedos alcanza, pulgar por debajo y dedo
por encima en escalas, poco pulgar y meñique en teclas negras, y cambio de posición en los saltos. Los acordes
usan digitaciones fijas (1-3-5, 1-2-5…). La mano izquierda es la imagen en espejo de la derecha. Si el MusicXML
trae dedos escritos, esos mandan."""
from itertools import product

BLACK = {1, 3, 6, 8, 10}
MAX_SPAN = {1: 4, 2: 6, 3: 8, 4: 10}          # semitonos máximos entre dedos separados k (sin cambiar de posición)
MIN_SPAN = {1: 1, 2: 2, 3: 3, 4: 5}


def _pos_cost(f, pitch):
    black = pitch % 12 in BLACK
    if not black:
        return {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.15, 5: 0.3}[f]
    return {1: 1.2, 2: 0.0, 3: -0.1, 4: 0.3, 5: 0.9}[f]


def _step_cost(q1, f1, q2, f2, rest):
    """Esfuerzo de pasar del dedo f1 (en q1) al f2 (en q2). q crece hacia el lado del meñique."""
    d, a = q2 - q1, abs(q2 - q1)
    if d == 0:
        cost = 0.5 if f1 == f2 else 2.5
    else:
        sign_ok = (f2 > f1) == (d > 0) and f1 != f2      # el dedo más alejado del pulgar va hacia el lado del meñique
        if f1 == f2:
            cost = 5.0 + 0.3 * a
        elif sign_ok:
            k = abs(f2 - f1)
            lo, hi = MIN_SPAN[k], MAX_SPAN[k]
            if a > hi:
                cost = 3.0 + (a - hi) * 1.0               # estirar o cambiar de posición
            elif a < lo:
                cost = 1.2 + (lo - a) * 0.6
            else:
                cost = 0.15 * abs(a - 1.7 * k)
        else:
            # cruce: pulgar por debajo (sube) o dedo por encima del pulgar (baja)
            thumb_under = (f2 == 1 and d > 0) or (f1 == 1 and d < 0)
            other = f1 if f2 == 1 else f2
            if thumb_under and a <= 5 and other in (2, 3, 4):
                cost = {3: 1.0, 4: 1.7, 2: 2.3}[other]
            elif thumb_under and a <= 5:
                cost = 3.5
            else:
                cost = 5.0 + 0.3 * a
    if a > 9:                                             # salto grande: la mano se recoloca con cualquier dedo
        cost = min(cost, 2.0 + 0.1 * a)
    if rest:                                              # con un silencio hay tiempo de cambiar de posición
        cost = min(cost, 0.6 + 0.08 * a)
    return cost


def _chord_fingers(pitches):
    """Dedos de un acorde (pitches en orden de q creciente = del pulgar al meñique)."""
    n, span = len(pitches), abs(pitches[-1] - pitches[0])
    if n == 1:
        return [1]
    if n == 2:
        if span >= 8:
            return [1, 5]
        return [1, 3] if span <= 4 else [1, 4]
    if n == 3:
        return [1, 2, 3] if span <= 4 else [1, 3, 5]
    if n == 4:
        return [1, 2, 3, 5] if span >= 9 else [1, 2, 3, 4]
    return ([1, 2, 3, 4, 5] + [5] * n)[:n]


def fingers_for_hand(notes, hand):
    """notes: [[inicio, duración, nota MIDI], ...]. Devuelve una lista con el dedo de cada nota, en el mismo orden."""
    if not notes:
        return []
    sign = 1 if hand == 'rh' else -1                      # mano izquierda = espejo
    groups, order = {}, []
    for i, (t, d, m) in enumerate(notes):
        key = round(t, 4)
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(i)
    order.sort()
    # cada grupo: notas de menor a mayor q; representante = la del lado del meñique
    seq = []
    for key in order:
        idx = sorted(groups[key], key=lambda i: sign * notes[i][2])
        ends = max(notes[i][0] + notes[i][1] for i in idx)
        qs = [sign * notes[i][2] for i in idx]
        seq.append({'idx': idx, 'q': qs, 'start': key, 'end': ends,
                    'fixed': _chord_fingers(qs) if len(idx) > 1 else None})
    INF = float('inf')
    best = []       # por grupo: {dedo_representante: (coste, dedo_previo)}
    for gi, g in enumerate(seq):
        rep_q = g['q'][-1]
        options = [g['fixed'][-1]] if g['fixed'] else [1, 2, 3, 4, 5]
        # el coste de posición de un acorde se suma con sus dedos fijos
        layer = {}
        for f in options:
            pc = (sum(_pos_cost(ff, sign * qq) for ff, qq in zip(g['fixed'], g['q'])) if g['fixed']
                  else _pos_cost(f, sign * rep_q))
            if gi == 0:
                layer[f] = (pc, None)
                continue
            prev, pg = best[-1], seq[gi - 1]
            rest = g['start'] - pg['end'] >= 0.99
            c, pf = min(((pcost + _step_cost(pg['q'][-1], pfing, rep_q, f, rest), pfing)
                         for pfing, (pcost, _) in prev.items()), key=lambda x: x[0])
            layer[f] = (c + pc, pf)
        best.append(layer)
    # recomponer el camino
    f = min(best[-1], key=lambda k: best[-1][k][0])
    reps = [0] * len(seq)
    for gi in range(len(seq) - 1, -1, -1):
        reps[gi] = f
        f = best[gi][f][1]
    out = [None] * len(notes)
    for g, rep in zip(seq, reps):
        fs = g['fixed'] if g['fixed'] else [rep]
        for i, ff in zip(g['idx'], fs):
            out[i] = ff
    return out


def compute(notes):
    """{'rh': [...], 'lh': [...]} para las notas de una versión."""
    return {hand: fingers_for_hand(notes.get(hand, []), hand) for hand in ('rh', 'lh')}
