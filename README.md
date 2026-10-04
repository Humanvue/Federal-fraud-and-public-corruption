# Federal Fraud and Public Corruption Tracker

A public, fact-first website tracking public corruption by federal officials from 2016 to the
present, built from cited and archived government sources. See `SPEC.md` for the full plan.

## For the owner: how to run things

You need Node.js 24 or newer installed once. After that, in this folder:

```bash
npm install
```

installs the project's dependencies (only needed once, or after dependencies change).

```bash
npm run check
```

validates all the data, runs the tests, and builds the site. If anything is wrong it prints
the file and the problem. This is exactly what GitHub runs on every change.

```bash
npm run dev
```

starts a local preview of the site at the address it prints (usually http://localhost:4321).
Press Ctrl+C to stop it. Search only works on the built site; to try it:

```bash
npm run build && npm run preview
```

## Editing data
Data lives in `data/` as YAML files, one record per file. If you use VS Code with the
"YAML" extension by Red Hat, the editor will check each file against the schema as you type.
After editing, run `npm run validate` to check everything together.

## Licenses
- Code: MIT (`LICENSE`).
- Data and written summaries: Creative Commons Attribution 4.0 (`LICENSE-DATA`).
- Government and court documents stored under `data/sources/text/`: public domain.
