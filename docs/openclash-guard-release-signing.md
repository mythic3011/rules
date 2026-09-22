# OpenClash Guard release signing

OpenClash Guard release metadata is signed with a detached `usign` signature. The private signing key must never be committed to the repository or exposed to pull-request code.

## Protected automated signer

`.github/workflows/sign-openclash-guard-release.yml` is an environment-gated signer whose trusted implementation lives on `main`.

The normal release path is automatic. Successful pull-request runs of both **Auto generate AI profiles** and **CodeQL Advanced** are observed through `workflow_run`. The signer qualifier runs from trusted `main`, resolves the exact same-repository candidate SHA, and only enters the protected signing environment when all of these conditions hold:

- the triggering workflow belongs to a same-repository pull request;
- the candidate branch still points at the exact SHA that produced the CI result;
- the candidate contains the current trusted `main` signer revision;
- the latest generation and CodeQL runs for that exact SHA both succeeded;
- trusted candidate verification succeeds without executing candidate code;
- the candidate sequence is exactly `trusted sequence + 1`;
- the candidate does not already contain a detached release signature.

The automatic path then signs and verifies the metadata and publishes a signature-only fast-forward commit to the unchanged candidate branch. It never auto-merges the pull request.

`workflow_dispatch` remains available as a break-glass path. A manual dispatch must still run from `main` and may be used for controlled same-sequence signature recovery or for an explicitly reviewed next-sequence candidate.

Candidate metadata and artifact bytes are read with `git show`; candidate shell/Python code is never executed by the signer. The trusted verifier from `main` validates the candidate before the signing key is used.

The signer rejects or skips:

- workflow executions whose trusted ref is not `main`;
- `target_branch=main` so signatures remain reviewable on a branch/PR;
- automatic triggers from fork repositories or non-PR workflow runs;
- candidate branches that do not contain the exact trusted `main` signer revision;
- stale workflow results after the candidate branch has moved;
- automatic candidates whose generation and CodeQL runs are not both successful at the exact candidate SHA;
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

A release candidate branch must contain current `main`. Generated release metadata must be stable and deterministic, and the candidate PR must remain open while CI runs.

The normal sequence is:

```text
candidate push
  -> generate/validate managed outputs
  -> CodeQL
  -> both workflows successful at the same candidate SHA
  -> trusted-main signer qualifier
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

If the branch moves while the workflows are completing, that signer run skips the stale SHA. The new candidate head must obtain its own generation and CodeQL results before it can qualify.

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
