# Third-party notices

The repository's MIT license applies to original contributions that its contributors are entitled to license. It does not replace third-party licenses or grant rights to third-party characters, trademarks, names, or other protected material.

## Character and franchise material

This is an unofficial fan project. Nikki (暖暖), Momo (大喵), and related franchise names and character designs involve rights held by Papergames and/or their respective owners. No affiliation, endorsement, or permission from those owners is claimed. The source-code license grants no license to those third-party rights. See the Chinese explanation in [README.md](README.md).

The game uses programmatically generated geometry and WebAudio synthesis. Official image, model, and audio files are not included in this source distribution. Programmatic creation does not itself grant rights to the underlying character designs.

Some source comments retain links to official character or costume reference pages to identify the inspiration for the programmatic designs. Those links are citations only: they do not grant permission to copy official artwork, and the linked official images have not been downloaded or bundled in this repository.

## Three.js

- Package: `three`
- Locked version: `0.170.0`
- Project: <https://github.com/mrdoob/three.js>
- License: MIT

`npm ci` installs the complete upstream license at `node_modules/three/LICENSE`. The static build preserves it as `dist/vendor/three/LICENSE`.

```text
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Optional native build dependencies

The following direct dependencies are declared by the native projects. Their own lockfiles record the exact versions and transitive dependencies. Their licenses are installed with the packages; keep the upstream notices when redistributing native binaries.

| Package / project | License | Source |
| --- | --- | --- |
| Electron | MIT, plus notices for bundled Chromium and other components | <https://github.com/electron/electron> |
| `@electron/packager` | BSD-2-Clause | <https://github.com/electron/packager> |
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` | MIT | <https://github.com/ionic-team/capacitor> |
| Gradle wrapper / Gradle | Apache-2.0 | <https://github.com/gradle/gradle> |
| Python runtime in Windows portable entry | PSF License and included component notices | <https://www.python.org/> |
| PyInstaller bootloader | GPL with the bootloader exception | <https://pyinstaller.org/en/stable/license.html> |

Android SDK, AndroidX, Android Gradle Plugin, and other dependencies are fetched by the Android toolchain and retain their respective licenses. This short inventory is not a replacement for the full notices of a packaged application. Electron builds include their upstream `LICENSE` and `LICENSES.chromium.html`; retain these with any redistributed runtime.

The Gradle 8.14.3 license and notices accompanying the included wrapper are preserved in [GRADLE-LICENSE.txt](docs/licenses/GRADLE-LICENSE.txt) and [GRADLE-NOTICE.txt](docs/licenses/GRADLE-NOTICE.txt).

The Windows portable entry bundles its Python runtime. Packaged builds include `launcher-LICENSES.txt` with the Python license and PyInstaller's full license/exception. Keep this file when redistributing the Windows package.
