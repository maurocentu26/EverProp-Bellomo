"""Extract a private workbook into a lossless, versioned import source (requires openpyxl)."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path

import openpyxl


def extract(source: Path) -> dict:
    workbook = openpyxl.load_workbook(source, read_only=True, data_only=False)
    result = {"source": source.name, "sha256": hashlib.sha256(source.read_bytes()).hexdigest(), "sheets": {}}
    try:
        for sheet in workbook:
            populated = [(i, row) for i, row in enumerate(sheet.iter_rows(values_only=True), 1) if any(v is not None for v in row)]
            if not populated:
                raise ValueError(f"Empty sheet: {sheet.title}")
            header_row, header_values = populated[0]
            headers = [str(v).strip() if v is not None else None for v in header_values]
            if None in headers or len(headers) != len(set(headers)):
                raise ValueError(f"Blank/duplicate headers: {sheet.title}")
            records = []
            for row_number, cells in populated[1:]:
                data = {}
                for header, value in zip(headers, cells, strict=True):
                    if isinstance(value, str) and value.startswith("="):
                        raise ValueError(f"Formula at {sheet.title}, row {row_number}; resolve source values first")
                    if isinstance(value, (datetime.date, datetime.datetime)):
                        value = value.isoformat()
                    data[header] = value
                records.append({"row": row_number, "data": data})
            result["sheets"][sheet.title] = {"headers": headers, "header_row": header_row, "records": records, "formulas": []}
    finally:
        workbook.close()
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    data = extract(args.workbook)
    with args.output.open("x", encoding="utf-8") as output:
        json.dump(data, output, ensure_ascii=False, allow_nan=False)
    print(json.dumps({"sha256": data["sha256"], "sheets": {name: len(sheet["records"]) for name, sheet in data["sheets"].items()}}))
