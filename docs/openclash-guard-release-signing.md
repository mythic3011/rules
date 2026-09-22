# OpenClash Guard release signing

OpenClash Guard release metadata is signed with a detached `usign` signature. The private signing key must never be committed to the repository or exposed to pull-request code.

## Protected automated signer

`.github/workflows/sign-openclash-guard-release.yml` is an environment-gated signer whose trusted implementation lives on `main`.

The normal release path is automatic. A successful **Auto generate AI profiles** `push` workflow run on a same-repository feature branch triggers the signer through `workflow_run`. The signer qualifier itself runs from trusted `main` and resolves the current branch head only after the generator has completed.

The generator may publish one deterministic managed-output commit with `GITHUB_TOKEN`. GitHub does not recursively create another workflow run for that bot push, so the signer explicitly handles this case: if the branch moved after the triggering generator SHA, the new head must still descend from that SHA and every intervening path must be inside the trusted `rulesctl managed-paths` set. If the new head has its own generator run, the older signer run skips and lets the newer run qualify it instead.

Automatic signing only enters the protected release environment when all of these conditions hold:

- the completed generator workflow is a successful same-repository `push` run;
- the target is not `main`;
- the candidate contains the current trusted `main` signer revision;
- the candidate still uses the same `auto-generate-ai-profiles.yml` bytes as trusted `main`;
- any post-generator branch movement is a descendant consisting only of managed-output paths and has no newer generator run of its own;
- trusted candidate verification succeeds without executing candidate code;
- the candidate sequence is exactly `trusted sequence + 1`;
- the candidate does not already contain a detached release signature.

The protected signing job then rechecks the exact branch head, signs and verifies the metadata, and publishes a signature-only fast-forward commit. It never auto-merges the pull request.

`workflow_dispatch` remains available as a break-glass path. A manual dispatch must still run from `main` and may be used for controlled same-sequence signature recovery or for an explicitly reviewed next-sequence candidate.

Candidate metadata and artifact bytes are read with `git show`; candidate shell/Python code is never executed by the signer. The trusted verifier from `main` validates the candidate before the signing key is used.

The signer rejects or skips:

- workflow executions whose trusted ref is not `main`;
- `target_branch=main` so signatures remain reviewable on a branch/PR;
- automatic triggers from fork repositories, failed generator runs, or non-push generator events;
- candidate branches that do not contain the exact trusted `main` signer revision;
- automatic candidates that changed the generator workflow relative to trusted `main`;
- branch movement that is not descended from the completed generator SHA;
- post-generator branch movement containing any non-managed path;
- stale older signer runs when the candidate head already has its own generator run;
- automatic candidates that are not exactly one release sequence ahead of trusted `main`;
- automatic candidates that already contain a detached signature;
- malformed or non-canonical release metadata;
- repository mismatches;
- sequence jumps greater than one;
- same-sequence metadata changes (equivocation);
- changed signed artifact paths;
- SHA-256 or size mismatches between metadata and candidate blobs;
- a deterministic release revision mismatch;
- signatures produced by a key whose public key identifier is not `66215942e340d69f`;
- any staged publication change other than `dist/openclash-guard.release.json.sig`;
- candidate movement after qualification, validation, or immediately before publication.

The final push is a normal fast-forward push. The workflow never force-pushes.

## Required GitHub Environment

Create an environment named exactly:

```text
openclash-guard-release
```

Treat these settings as part of the security boundary:

1. Restrict deployment branches/tags so **only `main`** may use the environment. This prevents a feature branch from editing the signer workflow and obtaining signing secrets.
2. Add environment secret `OPENCLASH_GUARD_USIGN_PRIVATE_KEY` containing the complete private `usign` key file.
3. Add environment secret `OPENCLASH_GUARD_USIGN_PUBLIC_KEY` containing the matching public `usign` key file.
4. Do not store the private key as a repository secret, Actions variable, artifact, cache entry, or checked-in file.

If the environment has required-reviewer approval enabled, GitHub will still pause before releasing the signing secrets. Leave that protection enabled when human approval is intentionally part of the release policy; remove that approval requirement if fully unattended signing is desired. The `main` deployment-branch restriction remains mandatory either way.

The public key is supplied separately even though it is not secret so the workflow can verify that the produced signature matches the expected release trust root before publication.

## Normal automatic release path

A release candidate branch must contain current `main`. Generated release metadata must be stable and deterministic.

The normal sequence is:

```text
candidate branch push
  -> trusted push generator validates source and generated contracts
  -> generator repairs/commits managed outputs when needed
  -> generator workflow completes successfully
  -> trusted-main signer qualifier resolves the exact current branch head
  -> if head moved, require managed-output-only descendant movement
  -> require candidate sequence == trusted sequence + 1
  -> verify candidate metadata without executing candidate code
  -> enter protected release environment
  -> sign metadata with usign
  -> verify detached signature and expected key id
  -> re-check unchanged branch head
  -> commit only dist/openclash-guard.release.json.sig
  -> re-check unchanged branch head
  -> normal fast-forward push
```

CodeQL and ordinary PR validation continue independently. They remain part of review/merge quality control; the signer no longer requires a maintainer to dispatch a separate signing run after those checks complete.

If the branch moves with a newer source commit while the previous generator run is finishing, the older signer run skips. The newer source push gets its own generator run and therefore its own qualification attempt.

## Manual recovery path

From GitHub Actions, **Sign OpenClash Guard release** can still be dispatched from the `main` workflow ref with a candidate branch name.

Manual dispatch uses the same trusted verifier and race checks, but it preserves the verifier's same-sequence recovery capability. This is useful when trusted `main` already contains byte-identical release metadata but the detached signature must be recovered or republished on a branch for review.

Manual dispatch must not be used to bypass candidate verification or force a signature onto a moved branch.

## Sequence handling

`internal/python/verify_openclash_guard_release_candidate.py` allows only:

- the trusted baseline sequence with byte-identical baseline metadata; or
- exactly `trusted sequence + 1`.

The automatic path intentionally narrows this further and signs only the second case. Same-sequence signing remains manual recovery only.

The first verifier case supports re-signing identical metadata after a missing signature without permitting same-sequence content changes. The second case supports a normal monotonic release advance. Larger jumps require an explicit trusted release-policy change rather than being silently signed.
