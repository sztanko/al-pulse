"""Record-level cleansing for the Azorean local-accommodation register.

The Azores keep their own register (RRAL) rather than feeding the national one,
and it is published as a QGIS Server WMS layer rather than as a tabular export.
What comes back is hand-typed operational data: trailing spaces, an island
spelled `São Miugel`, a freguesia filed as a concelho, coordinates as strings,
and the operator's name, e-mail and mobile number in every row.

This module is the record-level half of the cleansing. It is deliberately
*context-free*: every rule here looks at one field of one row and nothing else.
Anything needing the administrative hierarchy — which freguesia a point falls
in, whether a concelho exists — is resolved in dbt against `admin`, where the
OSM geometry and the parent/child relationships already live, and where the
project already resolves postcodes the same way (`invalid_postcode_similarities`
falls back to `st_contains`). Splitting it there keeps this file free of a
geometry dependency and keeps the relational work in SQL.

Two properties matter more than the individual rules:

- **Nothing is silently changed.** Every rule that alters or rejects a value
  records an `Issue` naming the rule, the field, the value before and after.
  The report is written next to the data and summarised to stdout, so a source
  that starts drifting shows up as a rule firing more often rather than as a
  number quietly moving on the site.
- **Rejection is explicit and bounded.** A row is dropped only by a rule that
  says so, and `validate()` fails the whole run if too many are dropped. A
  cleanser that quietly discards a third of its input is worse than no
  cleanser: the output still looks plausible.
"""

from __future__ import annotations

import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

# ---------------------------------------------------------------- vocabulary

#: The nine islands, as the Região Autónoma dos Açores names them. Used to snap
#: typos ("São Miugel") onto a known value; anything that does not resolve is
#: flagged rather than guessed.
ISLANDS = [
    "Santa Maria",
    "São Miguel",
    "Terceira",
    "Graciosa",
    "São Jorge",
    "Pico",
    "Faial",
    "Flores",
    "Corvo",
]

#: Establishment types, collapsed to the categories the source actually uses.
#: The keys are compared after `fold()`, so spacing and accents do not matter —
#: which is the whole point, since the source carries both "E. Hospedagem" and
#: "E.Hospedagem ".
TIPO_CANONICAL: dict[str, str] = {
    "moradia": "Moradia",
    "apartamento": "Apartamento",
    "quartos": "Quartos",
    "e hospedagem": "Estabelecimento de hospedagem",
    "e. hospedagem": "Estabelecimento de hospedagem",
    "estabelecimento de hospedagem": "Estabelecimento de hospedagem",
    "hostel": "Hostel",
}

#: Fields dropped before anything is written. The register publishes the
#: operator's name and contact details; this project has no use for them, the
#: national pipeline already discards the equivalent columns, and a committed
#: CSV is the last place they should end up.
PII_FIELDS = frozenset({"proprietar", "email", "telefone", "telemovel", "site"})

#: Bounding box of the archipelago, a little wider than the layer's own extent.
#: A coordinate outside this is not a location, it is a data-entry accident.
LON_MIN, LON_MAX = -31.6, -24.6
LAT_MIN, LAT_MAX = 36.7, 39.9

#: Plausible bounds per numeric field: (minimum, maximum). Values outside are
#: not clamped — clamping invents data — they are nulled and flagged.
NUMERIC_BOUNDS: dict[str, tuple[float, float]] = {
    "quartos": (0, 60),
    "camas": (0, 200),
    "ua": (0, 60),
    "rral": (1, 99999),
}


# --------------------------------------------------------------- primitives


# Names are never re-cased. `nome` is the operator's own spelling of a business
# name ("Welcome to Paradise", "RICHard's apartment") and title-casing it
# invents a different name; the administrative names are only ever *matched*,
# through `fold()`, and the label the site shows comes from `admin`, not from
# here. Casing is display, and none of this is display.


def fold(value: str | None) -> str:
    """Accent-free, case-free, whitespace-collapsed form, for comparison only.

    Never stored. Matching on it and keeping the original is what lets the site
    show `São Roque do Pico` while still joining it to `Sao Roque Do Pico`.
    """
    if value is None:
        return ""
    stripped = unicodedata.normalize("NFD", str(value))
    stripped = "".join(c for c in stripped if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", stripped.lower()).strip()


def tidy_text(value: Any) -> str | None:
    """Normalise a free-text field to NFC, single-spaced, trimmed, or None.

    Empty and whitespace-only become None rather than "": a missing value that
    reads as a value is the kind of thing that later gets counted.
    """
    if value is None:
        return None
    text = unicodedata.normalize("NFC", str(value))
    text = text.replace("\u00a0", " ")  # non-breaking space
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


def similarity(a: str, b: str) -> float:
    """Token-aware similarity in 0..1, for snapping a typo onto a known value.

    `difflib` on the raw strings rates `Pico` against `São Jorge` higher than it
    should, because short strings share letters. Comparing the token sets first
    and only then falling back to character similarity keeps `São Miugel` ->
    `São Miguel` while leaving genuinely different names apart.
    """
    from difflib import SequenceMatcher

    fa, fb = fold(a), fold(b)
    if not fa or not fb:
        return 0.0
    if fa == fb:
        return 1.0
    ta, tb = set(fa.split()), set(fb.split())
    jaccard = len(ta & tb) / len(ta | tb)
    chars = SequenceMatcher(None, fa, fb).ratio()
    return max(jaccard, chars * 0.95)


# ------------------------------------------------------------------- issues


@dataclass(frozen=True)
class Issue:
    """One thing a rule did to one field, kept so the run can be audited."""

    key: str
    field: str
    rule: str
    before: str
    after: str
    severity: str  # fixed | nulled | dropped | flagged


@dataclass
class Report:
    """What the run did, in enough detail to argue with."""

    fetched: int = 0
    written: int = 0
    dropped: int = 0
    issues: list[Issue] = field(default_factory=list)
    counters: Counter = field(default_factory=Counter)

    def note(
        self,
        key: str,
        fieldname: str,
        rule: str,
        before: Any,
        after: Any,
        severity: str = "fixed",
    ) -> None:
        self.issues.append(
            Issue(
                key=str(key),
                field=fieldname,
                rule=rule,
                before="" if before is None else str(before),
                after="" if after is None else str(after),
                severity=severity,
            )
        )
        self.counters[f"{severity}:{rule}"] += 1

    def by_rule(self) -> list[tuple[str, int]]:
        return sorted(self.counters.items(), key=lambda kv: (-kv[1], kv[0]))

    def as_dict(self) -> dict:
        return {
            "fetched": self.fetched,
            "written": self.written,
            "dropped": self.dropped,
            "by_rule": dict(self.by_rule()),
            # Examples, not the whole list: the point of the file is to be read.
            "examples": [
                {
                    "key": i.key,
                    "field": i.field,
                    "rule": i.rule,
                    "before": i.before,
                    "after": i.after,
                    "severity": i.severity,
                }
                for i in _first_per_rule(self.issues, limit=6)
            ],
        }


def _first_per_rule(issues: Iterable[Issue], limit: int) -> list[Issue]:
    seen: Counter = Counter()
    out: list[Issue] = []
    for issue in issues:
        if seen[issue.rule] >= limit:
            continue
        seen[issue.rule] += 1
        out.append(issue)
    return out


class Rejected(Exception):
    """Raised by a rule that has decided this row cannot be published."""

    def __init__(self, rule: str, reason: str):
        super().__init__(reason)
        self.rule = rule
        self.reason = reason


# -------------------------------------------------------------------- rules
#
# Each rule takes (row, key, report) and mutates `row` in place. They run in
# the order listed in `RULES`, which matters: text is tidied before anything
# tries to match it, and PII goes before anything else can copy it around.


def rule_drop_pii(row: dict, key: str, report: Report) -> None:
    for name in sorted(PII_FIELDS & row.keys()):
        if row[name] not in (None, ""):
            report.counters["dropped-field:" + name] += 1
        del row[name]


def rule_tidy_text(row: dict, key: str, report: Report) -> None:
    for name, value in list(row.items()):
        if not isinstance(value, str):
            continue
        cleaned = tidy_text(value)
        if cleaned != value:
            report.note(key, name, "tidy_text", value, cleaned)
        row[name] = cleaned


def rule_canonical_island(row: dict, key: str, report: Report) -> None:
    value = row.get("ilha")
    if not value:
        report.note(key, "ilha", "island_missing", value, None, "flagged")
        return
    folded = fold(value)
    exact = {fold(i): i for i in ISLANDS}
    if folded in exact:
        if exact[folded] != value:
            report.note(key, "ilha", "island_exact", value, exact[folded])
        row["ilha"] = exact[folded]
        return
    best, score = max(((i, similarity(value, i)) for i in ISLANDS), key=lambda x: x[1])
    if score >= 0.82:
        report.note(key, "ilha", "island_fuzzy", value, f"{best} ({score:.2f})")
        row["ilha"] = best
    else:
        report.note(key, "ilha", "island_unresolved", value, None, "flagged")
        row["ilha"] = None


def rule_canonical_tipo(row: dict, key: str, report: Report) -> None:
    value = row.get("tipo")
    if not value:
        report.note(key, "tipo", "tipo_missing", value, None, "flagged")
        return
    canonical = TIPO_CANONICAL.get(fold(value))
    if canonical is None:
        report.note(key, "tipo", "tipo_unknown", value, None, "flagged")
        row["tipo"] = None
        return
    if canonical != value:
        report.note(key, "tipo", "tipo_canonical", value, canonical)
    row["tipo"] = canonical


def rule_numbers(row: dict, key: str, report: Report) -> None:
    for name, (lo, hi) in NUMERIC_BOUNDS.items():
        raw = row.get(name)
        if raw in (None, ""):
            row[name] = None
            continue
        try:
            number = int(round(float(raw)))
        except (TypeError, ValueError):
            report.note(key, name, "number_unparseable", raw, None, "nulled")
            row[name] = None
            continue
        if not (lo <= number <= hi):
            # Deliberately not clamped. A 400-bed "moradia" is a typo, and a
            # clamped 200 would be indistinguishable from a real one.
            report.note(key, name, "number_out_of_range", raw, None, "nulled")
            row[name] = None
            continue
        row[name] = number


def rule_coordinates(row: dict, key: str, report: Report) -> None:
    """Parse the coordinates, which arrive as strings, and sanity-check them.

    Latitude and longitude swapped round is the classic failure and it is
    detectable here: no Azorean longitude is positive and no latitude is
    below -20, so a pair that only makes sense reversed is reversed.
    """
    try:
        lat = float(row.get("latitude"))
        lon = float(row.get("longitude"))
    except (TypeError, ValueError):
        report.note(
            key,
            "coordinates",
            "coords_unparseable",
            row.get("latitude"),
            None,
            "nulled",
        )
        row["latitude"] = row["longitude"] = None
        return

    in_box = lambda la, lo: LAT_MIN <= la <= LAT_MAX and LON_MIN <= lo <= LON_MAX
    if lat == lon:
        # The longitude field was filled with the latitude. It would otherwise
        # fail the bbox test and be reported as a vague "out of box"; naming it
        # is the difference between "the source has nine bad rows" and knowing
        # which mistake to expect next month.
        report.note(
            key, "coordinates", "coords_lon_equals_lat", f"{lat},{lon}", None, "nulled"
        )
        row["latitude"] = row["longitude"] = None
        return
    if not in_box(lat, lon) and in_box(lon, lat):
        report.note(
            key, "coordinates", "coords_swapped", f"{lat},{lon}", f"{lon},{lat}"
        )
        lat, lon = lon, lat
    if not in_box(lat, lon):
        report.note(
            key, "coordinates", "coords_out_of_box", f"{lat},{lon}", None, "nulled"
        )
        row["latitude"] = row["longitude"] = None
        return
    row["latitude"] = round(lat, 6)
    row["longitude"] = round(lon, 6)


def rule_require_identity(row: dict, key: str, report: Report) -> None:
    """A row with neither a registration number nor a location is not a record.

    Everything else can be missing and the row still counts towards its
    municipality; these two cannot.
    """
    if row.get("rral") is None and not row.get("nome"):
        raise Rejected("no_identity", "neither an RRAL number nor a name")
    if not row.get("concelho") and row.get("latitude") is None:
        raise Rejected("no_location", "neither a concelho nor usable coordinates")


RULES: list[Callable[[dict, str, Report], None]] = [
    rule_drop_pii,
    rule_tidy_text,
    rule_canonical_island,
    rule_canonical_tipo,
    rule_numbers,
    rule_coordinates,
    rule_require_identity,
]

#: Columns written, in order. Fixed rather than derived from the data so that a
#: field appearing or vanishing upstream is a loud schema change here.
OUTPUT_COLUMNS = [
    "rral",
    "nome",
    "tipo",
    "ilha",
    "concelho",
    "freguesia",
    "morada",
    "latitude",
    "longitude",
    "quartos",
    "camas",
    "ua",
    "source_id",
]


# ------------------------------------------------------------------ pipeline


def cleanse_rows(features: list[dict], report: Report) -> list[dict]:
    """Run every rule over every feature and return the rows worth publishing."""
    rows: list[dict] = []
    for feature in features:
        props = dict(feature.get("properties") or {})
        source_id = feature.get("id")
        key = str(props.get("rral") or source_id or "?")
        props["source_id"] = source_id
        try:
            for rule in RULES:
                rule(props, key, report)
        except Rejected as rejected:
            report.note(key, "row", rejected.rule, key, None, "dropped")
            report.dropped += 1
            continue
        rows.append({column: props.get(column) for column in OUTPUT_COLUMNS})
    return rows


def same_establishment(a: dict, b: dict) -> bool:
    """Do two rows sharing an RRAL number describe the same place?

    Name first, then position. Two rows 30 m apart with different names are two
    flats in one building, not one record entered twice.
    """
    if a.get("nome") and b.get("nome") and fold(a["nome"]) == fold(b["nome"]):
        return True
    if None in (
        a.get("latitude"),
        a.get("longitude"),
        b.get("latitude"),
        b.get("longitude"),
    ):
        return False
    # ~30 m, in degrees, at this latitude. Precision beyond that is not
    # meaningful for hand-entered coordinates.
    return (
        abs(a["latitude"] - b["latitude"]) < 3e-4
        and abs(a["longitude"] - b["longitude"]) < 4e-4
    )


def deduplicate(rows: list[dict], report: Report) -> list[dict]:
    """Collapse rows that are the same establishment recorded twice.

    The layer is queried as four overlapping tiles, so features arrive more
    than once by construction; those copies are identical and are already
    deduplicated on the feature id before this runs. What is left is the
    source's own duplication, and it comes in two kinds:

    - the same establishment entered twice, where the copies differ only in how
      complete they are — collapse, keeping the fuller row;
    - two *different* establishments sharing one RRAL number, which is a
      data-entry error in the register — keep both and flag it.

    Collapsing the second kind would silently delete a real establishment from
    the count, which is a worse outcome than a duplicated registration number
    that nothing downstream uses as a key.
    """
    groups: dict[Any, list[dict]] = {}
    unnumbered: list[dict] = []
    for row in rows:
        rral = row.get("rral")
        if rral is None:
            unnumbered.append(row)
        else:
            groups.setdefault(rral, []).append(row)

    completeness = lambda r: sum(1 for v in r.values() if v not in (None, ""))
    kept: list[dict] = []
    for rral, group in groups.items():
        if len(group) == 1:
            kept.extend(group)
            continue
        survivors: list[dict] = []
        for row in sorted(group, key=completeness, reverse=True):
            match = next((s for s in survivors if same_establishment(s, row)), None)
            if match is None:
                survivors.append(row)
            else:
                report.note(
                    str(rral),
                    "rral",
                    "duplicate_collapsed",
                    row.get("nome"),
                    match.get("nome"),
                )
        if len(survivors) > 1:
            report.note(
                str(rral),
                "rral",
                "rral_reused",
                " / ".join(str(r.get("nome")) for r in survivors),
                "kept all of them",
                "flagged",
            )
        kept.extend(survivors)

    kept.extend(unnumbered)
    return sorted(
        kept,
        key=lambda r: (
            r.get("rral") is None,
            r.get("rral") or 0,
            r.get("source_id") or "",
        ),
    )


@dataclass(frozen=True)
class Gate:
    """One publish-or-refuse condition, named so a failure explains itself."""

    name: str
    ok: bool
    detail: str


def validate(
    rows: list[dict], report: Report, previous_count: int | None = None
) -> list[Gate]:
    """Decide whether this pull is fit to publish.

    Modelled on the row-count gates in the monthly refresh script, and for the
    same reason: the failure that went unnoticed for six months on the national
    feed was a *silent* one, an empty export committed every month. A cleanser
    makes that worse, not better — it will happily produce a beautifully
    normalised empty file.
    """
    total = len(rows)
    with_area = sum(1 for r in rows if r.get("concelho"))
    with_coords = sum(1 for r in rows if r.get("latitude") is not None)
    dropped_share = report.dropped / max(1, report.dropped + total)

    gates = [
        Gate("row_count", total >= 3000, f"{total} rows (expected at least 3000)"),
        Gate(
            "has_concelho",
            with_area / max(1, total) >= 0.95,
            f"{with_area}/{total} rows carry a concelho",
        ),
        Gate(
            "has_coordinates",
            with_coords / max(1, total) >= 0.90,
            f"{with_coords}/{total} rows carry usable coordinates",
        ),
        Gate(
            "drop_rate",
            dropped_share <= 0.02,
            f"{report.dropped} rows dropped ({dropped_share:.1%})",
        ),
        Gate(
            "island_coverage",
            len({r["ilha"] for r in rows if r.get("ilha")}) >= 8,
            f"{len({r['ilha'] for r in rows if r.get('ilha')})} of 9 islands present",
        ),
    ]
    if previous_count:
        floor = int(previous_count * 0.8)
        gates.append(
            Gate(
                "not_a_partial_pull",
                total >= floor,
                f"{total} rows against {previous_count} last time (floor {floor})",
            )
        )
    return gates
