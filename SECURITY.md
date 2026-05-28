# Security Policy

## Supported versions

`kpm` is currently published as an alpha project. Security fixes are expected to target the current `main` branch and the latest alpha release line when releases are available.

| Version         | Supported   |
| --------------- | ----------- |
| `2.0.0-alpha.x` | Best-effort |
| Older versions  | No          |

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub Security Advisories for this repository when available. If advisories are unavailable, contact the repository owner and avoid posting exploit details in a public issue.

A useful report includes:

- affected version or commit;
- operating system and Node.js version;
- steps to reproduce;
- expected and actual impact;
- whether untrusted package content, GitHub tarballs, local `file:` packages, or generated LLM bridge files are involved.

## Security model

`kpm` installs and composes Markdown knowledge packages. It is not a sandbox for untrusted content.

- Review package content before using it in sensitive agent or editor workflows.
- Prefer pinned tags or commit SHAs over mutable branch refs for publishable packages.
- Treat generated LLM bridge notes as generated content that should be reviewed before use.
- `kpm audit` is an advisory signal only. It can highlight suspicious package contents, but it is not a security boundary and does not make untrusted packages safe.
