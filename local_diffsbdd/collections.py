"""Exports and comparisons use persisted molecules, never generated UI examples."""

import csv
from io import StringIO
import statistics
from pydantic import BaseModel, ConfigDict, Field
from rdkit import Chem


class MoleculeSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    job_id: str = Field(pattern="^[0-9a-f]{32}$")
    index: int = Field(ge=0, le=99)


def export_molecules(manager, selection, format_name):
    output = StringIO()
    rows = []
    molecules = []
    seen = set()
    suppliers = {}
    reports = {}
    for item in selection:
        key = (item.job_id, item.index)
        if key in seen:
            continue
        seen.add(key)
        if item.job_id not in suppliers:
            suppliers[item.job_id] = Chem.SDMolSupplier(
                str(manager.result_file(item.job_id, "molecules.sdf"))
            )
        supplier = suppliers[item.job_id]
        if item.index >= len(supplier) or supplier[item.index] is None:
            raise ValueError("选中的候选不存在，请刷新候选库。")
        molecule = Chem.Mol(supplier[item.index])
        molecule.SetProp("source_job", item.job_id)
        molecule.SetIntProp("source_index", item.index + 1)
        molecules.append(molecule)
        if item.job_id not in reports:
            reports[item.job_id] = (
                manager.get(item.job_id).get("report", {}).get("molecules", [])
            )
        report = reports[item.job_id]
        values = report[item.index] if item.index < len(report) else {}
        rows.append(
            {
                "job": item.job_id,
                "index": item.index + 1,
                "smiles": Chem.MolToSmiles(molecule),
                **{
                    k: values.get(k)
                    for k in ["molecular_weight", "qed", "sa", "logp", "fragments"]
                },
            }
        )
    if format_name == "sdf":
        writer = Chem.SDWriter(output)
        for molecule in molecules:
            writer.write(molecule)
        writer.flush()
        text = output.getvalue()
        writer.close()
        return text
    if format_name != "csv":
        raise ValueError("不支持的导出格式。")
    writer = csv.DictWriter(
        output,
        fieldnames=[
            "job",
            "index",
            "smiles",
            "molecular_weight",
            "qed",
            "sa",
            "logp",
            "fragments",
        ],
    )
    writer.writeheader()
    writer.writerows(rows)
    return output.getvalue()


def compare_jobs(manager, identifiers):
    rows = []
    for identifier in dict.fromkeys(identifiers):
        job = manager.get(identifier)
        report = job.get("report", {})
        molecules = report.get("molecules", [])
        valid = len(molecules)
        attempted = report.get("attempted", 0)
        row = {
            "id": identifier,
            "created_at": job.get("created_at"),
            "status": job["status"],
            "task": job.get("task"),
            "model": report.get("model", job.get("settings", {}).get("model")),
            "attempted": attempted,
            "valid": valid,
            "valid_fraction": valid / attempted if attempted else None,
            "unique": len({m["smiles"] for m in molecules}),
            "elapsed_seconds": report.get("elapsed_seconds"),
        }
        for metric in ["qed", "sa", "molecular_weight"]:
            values = [m[metric] for m in molecules if m.get(metric) is not None]
            row[f"mean_{metric}"] = statistics.mean(values) if values else None
        rows.append(row)
    return rows
