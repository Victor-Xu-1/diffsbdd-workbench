"""Population selection with sequential official noising-denoising calls."""

from rdkit import Chem
from rdkit.Chem import QED
from rdkit.Contrib.SA_Score.sascorer import calculateScore

from .sampling import Sampler


class Optimizer:
    def __init__(self, model, protein, residues, ligand_file, options):
        from optimize import diversify_ligands

        context = Sampler(model, protein, residues, options, ligand_file)
        self.diversify = diversify_ligands
        self.model = model
        self.options = options
        self.objective = options.objective
        self.score = QED.qed if self.objective == "qed" else calculateScore
        initial = context.initial
        if initial is None or len(Chem.GetMolFrags(initial)) != 1:
            raise ValueError("Optimization requires a valid, aligned 3D ligand.")
        self.best = initial
        self.initial_score = self.best_score = float(self.score(initial))
        self.pocket = context.pocket
        self.parents = [initial]
        self.candidates = []
        self.round = 1
        self.history = []

    def sample(self, position):
        parent = self.parents[position % len(self.parents)]
        pocket = {key: value.clone() for key, value in self.pocket.items()}
        return self.diversify(
            self.model,
            pocket,
            [parent],
            self.options.change_steps,
            sanitize=False,
            largest_frag=False,
            relax_iter=0,
        )

    def consider(self, molecule):
        score = float(self.score(molecule))
        better = (
            score > self.best_score
            if self.objective == "qed"
            else score < self.best_score
        )
        if better:
            self.best, self.best_score = Chem.Mol(molecule), score
        self.candidates.append((score, Chem.Mol(molecule)))
        improved = (
            score > self.initial_score
            if self.objective == "qed"
            else score < self.initial_score
        )
        return round(score, 5), improved

    def finish_round(self):
        self.candidates.sort(key=lambda pair: pair[0], reverse=self.objective == "qed")
        self.history.append(
            {
                "round": self.round,
                "valid": len(self.candidates),
                "best_score": self.candidates[0][0] if self.candidates else None,
            }
        )
        if not self.candidates and self.round < self.options.rounds:
            raise ValueError(
                "本轮未生成有效候选，无法选择下一轮起点。请减小改动幅度后重试。"
            )
        self.parents = [
            molecule for _, molecule in self.candidates[: self.options.survivors]
        ]
        self.candidates = []
        self.round += 1

    def summary(self):
        return {
            "objective": self.objective,
            "initial_score": self.initial_score,
            "best_score": self.best_score,
            "noising_steps": self.options.change_steps,
            "population": self.options.population,
            "rounds": self.options.rounds,
            "survivors": self.options.survivors,
            "history": list(self.history),
            "note": "QED/SA property optimization; no affinity improvement is claimed. Chemical graph may change.",
        }
