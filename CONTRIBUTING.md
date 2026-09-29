# Contributing

Keep model behavior and scientific claims traceable to the pinned upstream implementation. Do not introduce a second model loader, silently substitute a different model, or treat chemical validity as evidence of biological activity.

1. Work on a focused branch. Keep generated data, checkpoints, credentials, logs and screenshots out of commits.
2. Use `DesignOptions` for shared inference settings. Validate new UI fields at the API boundary; never pass arbitrary arguments, filenames or commands into the worker.
3. Add behavior tests for changed chemistry, state transitions, persistence and API failures. Real GPU and browser checks are required when their paths change. CPU fixtures are not proof of inference.
4. Run the commands in README, verify vendored assets, and document any scientific limitations or changed sample distributions.
5. Dependency and upstream changes must update the pinned lock/manifest and pass model-loading and inference regression checks. Preserve third-party notices.

The product version is defined only in `local_diffsbdd/__init__.py`. The API is currently local and version 0.1; changes to saved jobs should preserve old results without modifying or discarding user records. Frontend dependencies are managed by npm and `package-lock.json`; Python dependencies are managed by uv and `requirements.lock`. CPU-test dependency locks are generated outside the repository from the same production constraints.

All new workbench contributions are submitted under the repository's MIT license. Do not add materials you do not have permission to redistribute.

Bundled third-party distributions are immutable upstream assets: do not reformat them. Prettier checks workbench sources; the separate mandatory vendor verifier checks every distributed asset by SHA-256.
