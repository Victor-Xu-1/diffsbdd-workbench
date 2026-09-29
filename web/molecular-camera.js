/** View-only principal-axis orientation; molecular coordinates are never changed. */
export function ligandOrientation(atoms) {
  if (atoms.length < 3) return [0, 0, 0, 1];
  const points = atoms.map((a) => [a.x, a.y, a.z]);
  const center = [0, 1, 2].map(
    (i) => points.reduce((sum, p) => sum + p[i], 0) / points.length,
  );
  const matrix = [0, 1, 2].map((i) =>
    [0, 1, 2].map((j) =>
      points.reduce(
        (sum, p) => sum + (p[i] - center[i]) * (p[j] - center[j]),
        0,
      ),
    ),
  );
  const vectors = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  // Symmetric Jacobi diagonalization: 3x3 covariance converges within this bound.
  for (let iteration = 0; iteration < 24; iteration++) {
    let p = 0,
      q = 1;
    for (const [i, j] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ])
      if (Math.abs(matrix[i][j]) > Math.abs(matrix[p][q])) [p, q] = [i, j];
    if (Math.abs(matrix[p][q]) < 1e-10) break;
    const angle =
        0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]),
      c = Math.cos(angle),
      s = Math.sin(angle);
    const r = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    r[p][p] = c;
    r[q][q] = c;
    r[p][q] = s;
    r[q][p] = -s;
    const multiply = (a, b) =>
      [0, 1, 2].map((i) =>
        [0, 1, 2].map((j) =>
          [0, 1, 2].reduce((sum, k) => sum + a[i][k] * b[k][j], 0),
        ),
      );
    const updated = multiply(
        multiply(
          r[0].map((_, i) => r.map((row) => row[i])),
          matrix,
        ),
        r,
      ),
      axes = multiply(vectors, r);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        matrix[i][j] = updated[i][j];
        vectors[i][j] = axes[i][j];
      }
  }
  const order = [0, 1, 2].sort((a, b) => matrix[b][b] - matrix[a][a]);
  const rows = order.slice(0, 2).map((i) => {
    const v = vectors.map((row) => row[i]),
      largest = [0, 1, 2].sort((a, b) => Math.abs(v[b]) - Math.abs(v[a]))[0];
    return v.map((value) => value * (v[largest] < 0 ? -1 : 1));
  });
  const [x, y] = rows;
  rows.push([
    x[1] * y[2] - x[2] * y[1],
    x[2] * y[0] - x[0] * y[2],
    x[0] * y[1] - x[1] * y[0],
  ]);
  const m = rows,
    trace = m[0][0] + m[1][1] + m[2][2];
  let quaternion;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    quaternion = [
      (m[2][1] - m[1][2]) / s,
      (m[0][2] - m[2][0]) / s,
      (m[1][0] - m[0][1]) / s,
      s / 4,
    ];
  } else {
    const i = [0, 1, 2].sort((a, b) => m[b][b] - m[a][a])[0],
      j = (i + 1) % 3,
      k = (i + 2) % 3,
      s = Math.sqrt(1 + m[i][i] - m[j][j] - m[k][k]) * 2;
    quaternion = [0, 0, 0, 0];
    quaternion[i] = s / 4;
    quaternion[j] = (m[j][i] + m[i][j]) / s;
    quaternion[k] = (m[k][i] + m[i][k]) / s;
    quaternion[3] = (m[k][j] - m[j][k]) / s;
  }
  const norm = Math.hypot(...quaternion);
  return quaternion.map((value) => value / norm);
}
