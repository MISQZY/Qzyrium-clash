# Licensing

Copyright (C) 2026 MISQZY.

The original Qzyrium code and original branding are licensed under the GNU General
Public License, version 3 only (SPDX: GPL-3.0-only). See LICENSE. Third-party code,
fonts, artwork and datasets retain their respective licenses and copyright notices.

## Bundled components

- Mihomo: GNU GPL version 3. Source and release history:
  https://github.com/MetaCubeX/mihomo
- MetaCubeX meta-rules-dat: GNU GPL version 3 at the repository level. This project
  produces country.mmdb, geoip.dat and geosite.dat using upstream datasets with
  their own notices and terms; consult its README and build scripts:
  https://github.com/MetaCubeX/meta-rules-dat
- Science Gothic: SIL Open Font License 1.1. Copyright notices in the font files
  are preserved. See ScienceGothic-OFL.txt in the installed licenses directory.
  https://github.com/googlefonts/science-gothic
- Twemoji 16.0.1 graphics: Creative Commons Attribution 4.0 International,
  by Twitter, Inc. and other contributors. Unmodified SVGs are fetched on demand
  from jsDelivr. See Twemoji-NOTICE.txt in the installed licenses directory.
  https://github.com/jdecked/twemoji/tree/v16.0.1
- Country centroid coordinates: Google Developers countries.csv, CC BY 4.0.
  Coordinates are rounded to two decimal places and used as country estimates.
  See Country-Centers-NOTICE.txt in the installed licenses directory.
  https://developers.google.com/public-data/docs/canonical/countries_csv
- Electron and Chromium: see LICENSE.electron.txt and LICENSES.chromium.html
  alongside the installed application. Dependency license files are retained
  in the packaged application archive.

## Corresponding source for releases

When distributing binaries, provide clear access to the corresponding source for
the application and the exact bundled GPL-covered components, including the build
scripts and applicable upstream notices. A source archive of this repository alone
does not include Mihomo or the inputs used to generate downloaded geodata.

The resource preparation script downloads current upstream releases. Release
distributors must record the actual component versions and dataset revisions,
preserve access to the corresponding source, and identify it next to the binary
downloads. Linking only to an upstream project's current default branch is not a
record of the source corresponding to a particular release.
