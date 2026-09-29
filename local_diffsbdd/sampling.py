"""Thin adapter over official DiffSBDD generation and conditional inpainting."""

import math

import numpy as np
from Bio.PDB import PDBParser
from rdkit import Chem

from .inputs import SUPPORTED_ELEMENTS, input_file
from .results import write_report


def read_pose(path):
    path = input_file(path, ".sdf")
    if path.stat().st_size > 1_000_000:
        raise ValueError("三维起始结构文件不得超过 1 MB。")
    supplier = Chem.SDMolSupplier(str(path), removeHs=True)
    molecules = list(supplier)
    if not molecules or any(m is None for m in molecules):
        raise ValueError("起始 SDF 含无法解析的结构。")
    if not 1 <= sum(m.GetNumHeavyAtoms() for m in molecules) <= 80:
        raise ValueError("所有起始片段合计需含 1–80 个重原子。")
    for molecule in molecules:
        if molecule.GetNumConformers() != 1 or not molecule.GetConformer().Is3D():
            raise ValueError("起始结构需要与蛋白对齐的三维坐标。")
        if not np.isfinite(molecule.GetConformer().GetPositions()).all():
            raise ValueError("起始结构坐标无效。")
        if any(
            a.GetSymbol().upper() not in SUPPORTED_ELEMENTS for a in molecule.GetAtoms()
        ):
            raise ValueError("起始结构含不支持的元素。")
    merged = molecules[0]
    for molecule in molecules[1:]:
        merged = Chem.CombineMols(merged, molecule)
    if not 1 <= merged.GetNumHeavyAtoms() <= 80:
        raise ValueError("起始结构需含 1–80 个重原子。")
    return merged


def prepare_pocket(model, protein, residues):
    pdb = PDBParser(QUIET=True).get_structure("protein", str(protein))[0]
    selected = [
        pdb[key.split(":")[0]][(" ", int(key.split(":")[1]), " ")] for key in residues
    ]
    return model.prepare_pocket(selected, repeats=1)


class Sampler:
    def __init__(self, model, protein, residues, options, initial=None):
        self.model, self.protein, self.residues, self.options = (
            model,
            protein,
            residues,
            options,
        )
        self.pocket = prepare_pocket(model, protein, residues)
        self.initial = read_pose(initial) if initial else None
        if options.task == "inpaint":
            if (
                self.initial is None
                or max(options.fixed_atoms) >= self.initial.GetNumAtoms()
            ):
                raise ValueError("保留原子编号超出起始结构，请重新选择原子。")
            if (
                options.size_mode == "fixed"
                and not 8 <= len(options.fixed_atoms) + options.added_atoms <= 80
            ):
                raise ValueError("保留原子与新增原子合计需为 8–80。")
            if options.preserve_bonds:
                selected = set(options.fixed_atoms)
                for ring in self.initial.GetRingInfo().AtomRings():
                    if all(
                        self.initial.GetAtomWithIdx(i).GetIsAromatic() for i in ring
                    ):
                        if selected.intersection(ring) and not set(ring).issubset(
                            selected
                        ):
                            raise ValueError(
                                "保留完整片段时请完整选择芳香环，或改用“仅元素与位置”模式。"
                            )
        if self.initial is not None:
            xyz = self.initial.GetConformer().GetPositions()
            pocket_xyz = self.pocket["x"].detach().cpu().numpy()
            if np.linalg.norm(xyz[:, None] - pocket_xyz[None, :], axis=-1).min() > 8:
                raise ValueError(
                    "起始结构距离口袋过远，请上传与蛋白坐标对齐的三维结构。"
                )

    def size(self, fixed=0):
        import torch

        opt = self.options
        if opt.size_mode == "sample":
            sampled = int(
                self.model.ddpm.size_distribution.sample_conditional(
                    n1=None, n2=self.pocket["size"]
                ).item()
            )
            count = min(80, max(fixed, opt.minimum_atoms, sampled + opt.size_bias))
        else:
            count = fixed + opt.added_atoms if fixed else opt.atoms
        return torch.tensor([count], device=self.model.device)

    def sample(self, directory=None):
        opt = self.options
        if opt.task == "diversify":
            from optimize import diversify_ligands

            pocket = {key: value.clone() for key, value in self.pocket.items()}
            return diversify_ligands(
                self.model,
                pocket,
                [self.initial],
                opt.change_steps,
                sanitize=False,
                largest_frag=False,
                relax_iter=0,
            )
        if opt.task == "generate":
            return self.model.generate_ligands(
                str(self.protein),
                1,
                pocket_ids=self.residues,
                num_nodes_lig=self.size(),
                sanitize=False,
                largest_frag=False,
                relax_iter=0,
                timesteps=opt.steps,
                resamplings=opt.resamplings,
                jump_length=opt.jump_length,
            )
        return self.inpaint(directory)

    def inpaint(self, directory):
        import torch
        import torch.nn.functional as functional
        from analysis.molecule_builder import build_molecule

        model, opt = self.model, self.options
        indices = opt.fixed_atoms
        size = self.size(len(indices))
        n_atoms = int(size.item())
        coords = torch.zeros((n_atoms, model.x_dims), device=model.device)
        features = torch.zeros((n_atoms, model.atom_nf), device=model.device)
        coords[: len(indices)] = torch.tensor(
            self.initial.GetConformer().GetPositions()[indices],
            dtype=torch.float32,
            device=model.device,
        )
        elements = [
            model.lig_type_encoder[self.initial.GetAtomWithIdx(i).GetSymbol()]
            for i in indices
        ]
        features[: len(indices)] = functional.one_hot(
            torch.tensor(elements, device=model.device), num_classes=model.atom_nf
        )
        mask = torch.zeros(n_atoms, dtype=torch.long, device=model.device)
        ligand = {"x": coords, "one_hot": features, "size": size, "mask": mask}
        fixed = torch.zeros(n_atoms, device=model.device)
        fixed[: len(indices)] = 1
        frames = math.gcd(opt.steps, 50) if opt.trajectory else 1
        pocket = {key: value.clone() for key, value in self.pocket.items()}
        center_before = pocket["x"].mean(dim=0)
        xh, pocket_xh, _, _ = model.ddpm.inpaint(
            ligand,
            pocket,
            fixed,
            center=opt.center,
            resamplings=opt.resamplings,
            timesteps=opt.steps,
            return_frames=frames,
        )
        if frames == 1:
            xh, pocket_xh = xh.unsqueeze(0), pocket_xh.unsqueeze(0)
        xh[:, :, :3] += (center_before - pocket_xh[:, :, :3].mean(dim=1))[:, None, :]
        if opt.trajectory and directory:
            write_report(
                directory / "trajectory.json",
                {
                    "note": "扩散模型的生成过程，不是分子动力学轨迹；中间原子类别与化学键未定型。",
                    "frames": [
                        {
                            "elements": [
                                model.lig_type_decoder[int(i)]
                                for i in frame[:, 3:].argmax(-1)
                            ],
                            "coordinates": frame[:, :3]
                            .detach()
                            .cpu()
                            .numpy()
                            .round(4)
                            .tolist(),
                        }
                        for frame in reversed(xh)
                    ],
                },
            )
        final = xh[0].detach().cpu()
        return [
            build_molecule(
                final[:, :3],
                final[:, 3:].argmax(-1),
                model.dataset_info,
                add_coords=True,
            )
        ]

    def restore_fixed_bonds(self, molecule):
        """Known fragment bonds constrain reconstruction, not the neural network.

        The upstream model generates elements/positions, not bond types. Preserve
        raw output separately, then restore supplied bonds among the fixed atoms.
        Newly generated connections still come from the upstream OpenBabel builder.
        """
        if self.options.task != "inpaint" or not self.options.preserve_bonds:
            return molecule
        indices = self.options.fixed_atoms
        mapping = {source: destination for destination, source in enumerate(indices)}
        restored = Chem.RWMol(molecule)
        for source, destination in mapping.items():
            expected = self.initial.GetAtomWithIdx(source)
            atom = restored.GetAtomWithIdx(destination)
            if atom.GetAtomicNum() != expected.GetAtomicNum():
                return molecule  # The subsequent constraint check rejects changed elements.
            atom.SetFormalCharge(expected.GetFormalCharge())
            atom.SetIsAromatic(False)
            atom.SetNoImplicit(False)
            atom.SetNumExplicitHs(expected.GetNumExplicitHs())
        for bond in list(restored.GetBonds()):
            if bond.GetBeginAtomIdx() < len(indices) and bond.GetEndAtomIdx() < len(
                indices
            ):
                restored.RemoveBond(bond.GetBeginAtomIdx(), bond.GetEndAtomIdx())
        for bond in self.initial.GetBonds():
            left, right = bond.GetBeginAtomIdx(), bond.GetEndAtomIdx()
            if left in mapping and right in mapping:
                restored.AddBond(mapping[left], mapping[right], bond.GetBondType())
                if bond.GetIsAromatic():
                    restored.GetAtomWithIdx(mapping[left]).SetIsAromatic(True)
                    restored.GetAtomWithIdx(mapping[right]).SetIsAromatic(True)
        return restored.GetMol()

    def check_fixed(self, molecule):
        if self.options.task != "inpaint":
            return None
        if not self.options.preserve_bonds:
            # Atom-only mode exactly matches the official conditioning semantics.
            from scipy.optimize import linear_sum_assignment

            indices = self.options.fixed_atoms
            expected = self.initial.GetConformer().GetPositions()[indices]
            actual = molecule.GetConformer().GetPositions()
            distances = np.linalg.norm(expected[:, None] - actual[None, :], axis=-1)
            for i, source in enumerate(indices):
                for j, atom in enumerate(molecule.GetAtoms()):
                    if (
                        atom.GetAtomicNum()
                        != self.initial.GetAtomWithIdx(source).GetAtomicNum()
                    ):
                        distances[i, j] = 1e6
            rows, columns = linear_sum_assignment(distances)
            if len(rows) == len(indices) and distances[rows, columns].max() <= 0.5:
                return None
            return "未保留所选原子的元素与空间位置。"
        labelled = Chem.Mol(self.initial)
        for atom in labelled.GetAtoms():
            atom.SetAtomMapNum(atom.GetIdx() + 1)
        query = Chem.MolFromSmarts(
            Chem.MolFragmentToSmarts(labelled, self.options.fixed_atoms)
        )
        if query is None:
            raise ValueError("无法定义保留片段，请检查原子选择。")
        # SMARTS traverses bonds rather than original indices. Atom maps retain
        # the source identity, including rings and disconnected selections.
        indices = [atom.GetAtomMapNum() - 1 for atom in query.GetAtoms()]
        expected = self.initial.GetConformer().GetPositions()[indices]
        actual = molecule.GetConformer().GetPositions()
        matches = molecule.GetSubstructMatches(query, uniquify=False, maxMatches=1000)
        for match in matches:
            if np.max(np.linalg.norm(actual[list(match)] - expected, axis=1)) <= 0.5:
                return None
        return "未完整保留所选片段的元素、化学键及空间位置（允许偏移 0.5 Å）。"
