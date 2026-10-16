"""Validate OAS 3.1, route coverage and optional real HTTP request/response captures."""
import argparse
import ast
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--captures", type=Path)
args = parser.parse_args()
document = json.loads((root / "openapi.json").read_text())
validate(document)
routes = set()
for app in ("accounts", "productivity"):
    tree = ast.parse((root / f"backend/{app}/urls.py").read_text())
    routes.update(
        "/api/v2/" + node.args[0].value for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
        and node.func.id == "path" and isinstance(node.args[0], ast.Constant)
    )
assert routes == set(document["paths"]), (routes - document["paths"].keys(), document["paths"].keys() - routes)
print(f"PASS: OpenAPI 3.1 and exact route coverage ({len(routes)} paths)")
if args.captures:
    captures = json.loads(args.captures.read_text())
    for capture in captures:
        operation = document["paths"][capture["path"]][capture["method"].lower()]
        if capture.get("validRequest"):
            schema = operation["requestBody"]["content"]["application/json"]["schema"]
            Draft202012Validator(dict(schema, components=document["components"]), format_checker=FormatChecker()).validate(capture["request"])
        response = operation["responses"][str(capture["status"])]["content"][capture["contentType"]]
        schema = dict(response["schema"], components=document["components"])
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(capture["body"])
    print(f"PASS: {len(captures)} real HTTP captures match documented status, media type and schema")
