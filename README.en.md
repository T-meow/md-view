# md-view

[中文](README.md)

md-view is a local Markdown reader and editor built with Tauri 2, Svelte, and Vite. It is designed for users who want a lightweight local Markdown tool that can be downloaded, modified, and rebuilt easily.

## Highlights

- Lightweight: the Windows installer is about 1.3 MB, and the Windows exe is about 2.9 MB.
- Small app size: easy to download, package, copy, and run locally.
- Outline panel: extracts headings automatically and supports quick navigation.
- Multiple views: read mode, source editing, visual editing, and split preview.
- Appearance options: built-in themes and custom reader background images.
- Local-first: opens local `.md` / `.markdown` files or folders without a cloud service.

![md-view preview](assets/preview.png)

## Features

- Open local Markdown files or folders
- Browse files with a file tree
- Source editing, reading preview, visual editing, and split preview
- Jump through the heading outline
- Draft saving
- Save conflict detection
- Support for `.md` and `.markdown`
- Theme switching and reader background images
- Windows default-app settings entry

## Local Development

Install these first:

- Node.js 20+
- Rust stable
- The Tauri desktop dependencies required by your operating system

Run:

```bash
npm install
npm run tauri:dev
```

## Local Packaging

```bash
npm install
npm run tauri:build
```

Build artifacts are written to:

```text
src-tauri/target/release/bundle/
```

The current configuration builds the package types supported by the current system:

- Windows: NSIS installer
- macOS: DMG
- Linux: AppImage, DEB, RPM

On Windows, the default local build uses NSIS to avoid downloading WiX for the `all` target. To try every bundle target supported by the current system, run:

```bash
npm run tauri:build:all
```

## Linux Dependencies

Ubuntu/Debian usually needs:

```bash
sudo apt-get update
sudo apt-get install -y build-essential curl wget file libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf rpm
```

For other distributions, install the corresponding Tauri 2 Linux dependencies.

## macOS Note

This project does not perform Apple signing or notarization by default. If you package and share it directly, macOS may block the unsigned app with Gatekeeper. Add a developer certificate, signing, and notarization before formal public distribution.

## GitHub Actions

The repository includes `.github/workflows/build.yml`:

- Builds all platforms on pushes to `main` / `master`
- Runs build checks for pull requests to `main` / `master`
- Supports manual workflow runs
- Creates a draft Release and uploads build artifacts when a `v*` tag is pushed

Example:

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Contributions

Pull requests are not accepted. Fork this repository and use an AI coding agent or local editor to make, package, and distribute your own changes.

## License and Disclaimer

This project uses WTFPL v2. In short: do what you want with it.

Disclaimer: this project is provided as is, without any express or implied warranty. The author does not guarantee that it is suitable for any particular purpose and is not responsible for any issues, losses, or liability caused by using, modifying, packaging, distributing, or running this project. Use it at your own risk.
