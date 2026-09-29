# Third-party notices and provenance

The root MIT license applies to the workbench's original code. It does not replace licenses of separately installed scientific dependencies, upstream code, pretrained weights, or bundled browser libraries.

| Component | Version / source | Terms and attribution |
|---|---|---|
| DiffSBDD | `arneschneuing/DiffSBDD`, commit `5d0d38d16c8932a0339fd2ce3f67ade98bbdff27` | MIT; Arne Schneuing, Yuanqi Du, Charles Harris. Full notice: `UPSTREAM-LICENSE`. Installed separately. The sampling adapter follows the official inference methods; reviewed compatibility changes are in `patches/upstream.patch`. |
| Official DiffSBDD weights | [Zenodo 8183747](https://doi.org/10.5281/zenodo.8183747), version 1, Arne Schneuing | **CC BY 4.0**, as declared by the record metadata. Downloaded directly from the publisher; not included in Git. Exact file sizes and checksums: `models.json`. |
| 3Dmol.js | npm `3dmol@2.5.5` | BSD-3-Clause, University of Pittsburgh and contributors. Its included GLmol/Three.js/jQuery notices are preserved in `web/vendor/3dmol/LICENSE`. |
| Ketcher | Official standalone release `v3.18.0`, EPAM Systems | Apache-2.0. Unmodified release assets plus `web/vendor/ketcher/LICENSE`, `NOTICE`, and bundled dependency notices. Embedded locally; no remote chemistry server. |
| Tabler Icons | npm `@tabler/icons@3.48.0` | MIT, Paweł Kuna. Only the declared SVG icons and full license are included. |
| RDKit and SA score | Locked Python distribution | BSD-style terms retained by the installed distribution. SA is the Ertl/Schuffenhauer heuristic, exposed on its raw 1–10 scale. |
| ProLIF | `prolif==2.2.2`, [official project](https://github.com/chemosim-lab/ProLIF), Cédric Bouysset and contributors | Apache-2.0; installed separately. The workbench uses the library's typed interaction detectors and implicit-hydrogen preparation, not copied detector code. |
| Gemmi / MDAnalysis | `gemmi==0.7.5` / `MDAnalysis==2.9.0` | Separately installed distributions retain MPL-2.0 / LGPLv3+ terms and their included component notices. No library binaries are redistributed in this repository. |
| wwPDB Chemical Component Dictionary | `local_diffsbdd/data/components/CFF.cif`, [source](https://files.rcsb.org/ligands/download/CFF.cif) | [CC0 archive usage policy](https://www.wwpdb.org/about/usage-policies). SHA-256: `e3dfd22bebdc6d3faa36ba16a6627e9c8451ad3e6ebd58974e51be616fc24147`. The unmodified public definition supplies caffeine atom names and bonds, not substitute coordinates. Optional runtime downloads retain the same source and are not committed. |
| OpenBabel | `openbabel-wheel@3.1.1.22` | Separately installed Open Babel library retains its GPL terms; it is not relicensed as MIT and no wheel/library binary is redistributed in this repository. |
| Other Python / development dependencies | `requirements.lock`, `package-lock.json` | Installed from their original distributions, retaining their own licenses. |

`examples/3rfm.pdb` is the public protein example distributed with DiffSBDD. `tests/fixtures/generated_3rfm.sdf` is a real molecule generated locally from that example for deterministic chemistry/UI tests. No private user input or experimental result is included.

## Bundled browser asset updates

`vendor-manifest.json` records every bundled file hash, the original distribution archive URL, version and SHA-256. `python tools/vendor_assets.py --verify` verifies the committed assets without network access. `--restore` downloads the pinned archives, checks their digests, extracts only declared files, and restores the supplemental license files from their pinned URLs.

To upgrade, review the upstream license and release, update the manifest deliberately, and run the browser and asset verification tests. Do not replace a file while retaining the old version/digest. The workbench does not load a CDN at runtime.

Scientific citation:

Schneuing A. et al. **Structure-based drug design with equivariant diffusion models.** Nature Computational Science 4, 899–909 (2024). DOI: [10.1038/s43588-024-00737-x](https://doi.org/10.1038/s43588-024-00737-x).
