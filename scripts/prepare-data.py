from __future__ import annotations

import csv
import json
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
RAW_DIR = ROOT / "data" / "raw"
PROCESSED_DIR = ROOT / "data" / "processed"
PUBLIC_DATA_DIR = ROOT / "public" / "data"

BARRIER_COLUMNS = [
    "experience_barrier",
    "job_scarcity_barrier",
    "low_salary_barrier",
    "temporary_contract_barrier",
    "opportunity_scarcity_barrier",
    "internship_access_barrier",
    "discrimination_barrier",
    "migration_barrier",
    "public_transport_barrier",
]

BARRIER_LABELS = {
    "experience_barrier": "Falta de experiencia",
    "job_scarcity_barrier": "Escasez de ofertas",
    "low_salary_barrier": "Salarios insuficientes",
    "temporary_contract_barrier": "Contratos temporales",
    "opportunity_scarcity_barrier": "Falta de oportunidades",
    "internship_access_barrier": "Acceso a practicas",
    "discrimination_barrier": "Discriminacion",
    "migration_barrier": "Necesidad de migrar",
    "public_transport_barrier": "Transporte publico",
}

CATEGORICAL_COLUMNS = [
    "education_level",
    "employment_status",
    "relation_to_problem",
    "first_job_difficulty",
    "career_guidance_received",
    "regional_job_opportunities",
    "regional_career_prospects",
    "mobility_intention",
]

TEXT_COLUMNS = [
    "main_job_search_barriers",
    "advice_to_young_people",
    "proposed_public_measure",
]

STOPWORDS = {
    "actual",
    "alguna",
    "alguien",
    "ante",
    "anos",
    "cada",
    "como",
    "con",
    "del",
    "desde",
    "donde",
    "ella",
    "ellos",
    "empresas",
    "entre",
    "esta",
    "este",
    "esto",
    "fuera",
    "hacer",
    "hasta",
    "joven",
    "jovenes",
    "laboral",
    "los",
    "mas",
    "mayor",
    "para",
    "pero",
    "por",
    "que",
    "sin",
    "son",
    "sus",
    "una",
    "uno",
    "unos",
}


def normalize_value(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def slug_to_label(path: Path) -> str:
    label = path.stem.replace("_", " ").replace("-", " ").strip()
    return label.title() or "Fase"


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as file:
        reader = csv.DictReader(file)
        return [{key: normalize_value(value) for key, value in row.items()} for row in reader]


def read_excel(path: Path) -> list[dict[str, str]]:
    try:
        import pandas as pd
    except ImportError as exc:
        raise SystemExit(
            "Para leer Excel instala las dependencias con: pip install -r requirements.txt"
        ) from exc

    dataframe = pd.read_excel(path)
    dataframe = dataframe.fillna("")
    return [
        {str(key): normalize_value(value) for key, value in row.items()}
        for row in dataframe.to_dict(orient="records")
    ]


def discover_sources() -> list[tuple[str, Path]]:
    source_files = sorted(
        [
            path
            for path in RAW_DIR.glob("*")
            if path.suffix.lower() in {".csv", ".xls", ".xlsx"}
        ]
    )

    if not source_files:
        fallback = PROJECT_ROOT / "cleanData.csv"
        if fallback.exists():
            return [("Fase 1", fallback)]
        raise SystemExit("No se encontraron archivos en data/raw ni cleanData.csv en la carpeta TFM.")

    return [(slug_to_label(path), path) for path in source_files]


def load_rows(phase: str, path: Path) -> list[dict[str, str]]:
    rows = read_excel(path) if path.suffix.lower() in {".xls", ".xlsx"} else read_csv(path)
    return [{"phase": phase, **row} for row in rows]


def parse_number(value: Any) -> float | None:
    text = normalize_value(value).replace(",", ".")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def year_to_age_group(value: Any) -> str:
    year = parse_number(value)
    if year is None:
        return "Sin dato"
    age = datetime.now().year - int(year)
    if age < 25:
        return "Menos de 25"
    if age < 30:
        return "25-29"
    if age < 35:
        return "30-34"
    if age < 45:
        return "35-44"
    return "45 o mas"


def distribution(rows: list[dict[str, str]], column: str) -> list[dict[str, Any]]:
    counter = Counter(normalize_value(row.get(column)) or "Sin dato" for row in rows)
    return [
        {"name": name, "value": value}
        for name, value in sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    ]


def average_barriers(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    result = []
    for column in BARRIER_COLUMNS:
        values = [parse_number(row.get(column)) for row in rows]
        clean_values = [value for value in values if value is not None]
        average = sum(clean_values) / len(clean_values) if clean_values else 0
        result.append(
            {
                "key": column,
                "name": BARRIER_LABELS[column],
                "average": round(average, 2),
                "responses": len(clean_values),
            }
        )
    return sorted(result, key=lambda item: item["average"], reverse=True)


def top_terms(rows: list[dict[str, str]]) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    for row in rows:
        for column in TEXT_COLUMNS:
            text = normalize_value(row.get(column)).lower()
            words = re.findall(r"[a-zA-ZáéíóúüñÁÉÍÓÚÜÑ]{4,}", text)
            for word in words:
                normalized = (
                    word.replace("á", "a")
                    .replace("é", "e")
                    .replace("í", "i")
                    .replace("ó", "o")
                    .replace("ú", "u")
                    .replace("ü", "u")
                    .replace("ñ", "n")
                )
                if normalized not in STOPWORDS:
                    counter[normalized] += 1

    return [{"name": name, "value": value} for name, value in counter.most_common(30)]


def representative_quotes(rows: list[dict[str, str]], column: str, limit: int = 8) -> list[str]:
    quotes = [normalize_value(row.get(column)) for row in rows if normalize_value(row.get(column))]
    return quotes[:limit]


def build_payload(rows: list[dict[str, str]], source_paths: list[Path]) -> dict[str, Any]:
    for row in rows:
        row["age_group"] = year_to_age_group(row.get("birth_year"))

    phases = distribution(rows, "phase")
    by_phase = {}
    for phase in [item["name"] for item in phases]:
        phase_rows = [row for row in rows if row.get("phase") == phase]
        by_phase[phase] = {
            "responses": len(phase_rows),
            "barriers": average_barriers(phase_rows),
            "difficulty": distribution(phase_rows, "first_job_difficulty"),
            "mobility": distribution(phase_rows, "mobility_intention"),
        }

    return {
        "metadata": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "totalResponses": len(rows),
            "sources": [str(path.relative_to(PROJECT_ROOT)) for path in source_paths],
            "barrierScale": "1 = poca dificultad, 5 = mucha dificultad",
        },
        "rows": rows,
        "summary": {
            "phases": phases,
            "ageGroups": distribution(rows, "age_group"),
            "barriers": average_barriers(rows),
            "topTerms": top_terms(rows),
            "categories": {column: distribution(rows, column) for column in CATEGORICAL_COLUMNS},
            "quotes": {column: representative_quotes(rows, column) for column in TEXT_COLUMNS},
            "byPhase": by_phase,
        },
    }


def main() -> None:
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    PUBLIC_DATA_DIR.mkdir(parents=True, exist_ok=True)

    sources = discover_sources()
    rows: list[dict[str, str]] = []
    source_paths: list[Path] = []
    for phase, path in sources:
        rows.extend(load_rows(phase, path))
        source_paths.append(path)

    payload = build_payload(rows, source_paths)
    output = PROCESSED_DIR / "dashboard-data.json"
    public_output = PUBLIC_DATA_DIR / "dashboard-data.json"
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    public_output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Datos preparados: {len(rows)} respuestas -> {public_output}")


if __name__ == "__main__":
    main()
