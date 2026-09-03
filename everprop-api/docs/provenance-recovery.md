# EverProp API provenance recovery

Recovery date (UTC): 2026-08-24T14:52:14Z

This repository starts from an audited local source tree recovered without a
recoverable Git history. No prior commit, reference, reflog, Git object, bundle,
or authoritative API remote was available at the time of recovery.

## Recovery evidence

- Original source-tree fingerprint: `8ec30ee3e0d79d0b826bb50d67e9d35c30fed962b5c2299768cb55c9d7a9207d`
- Historical Docker image digest: `sha256:d9728728edf45d7e1c6e2cbac6569cf405fa4c4567205a5c73deeaa5f54dc90e`
- Baseline SQL SHA-256: `4C8B170BC6F8B6827E9B85E756ACB2254CCF392B0FF4C11459C775366BAE472D`
- Laravel: `13.24.0`
- PHP: `8.4.24`
- MySQL: `8.4.11`
- Active database contract: 40 tables, 95 foreign keys, 3 views, and 2 stored procedures
- `schema_versions`: 3 validated entries

The historical Docker image is evidence associated with the recovered local
environment, but it is not considered a reproducible build of this baseline.
Future images must be built from explicitly identified commits.

This recovery establishes integrity from the audited tree forward. It makes no
claim about authorship, chronology, or source history before the initial commit.
