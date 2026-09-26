# Wireframe renderer

The Figma MCP connector stops answering once the Starter plan's tool-call allowance is spent, which
is how the referral section went unbuilt the first time. This reads the exported `.fig` directly
instead, so the design can always be looked at from a checkout:

```bash
cd tools/wireframes && npm install
node render.js                      # every section and screen → ./out/*.png
node render.js '' '' '2.' '6.6'     # only frames whose name starts with 2. or 6.6
npm run notes                       # → design/wireframes/FUNCTION_NOTES.md
```

It needs the fonts from the app's `node_modules/@expo-google-fonts` (run `npm install` at the
root first) and a Chromium (`CHROME_PATH`, default is the one preinstalled in Claude Code cloud
sessions). Text fill gradients render as flat colour, and images as grey — close enough to build
from, not a replacement for Figma.

Export a fresh `.fig` from Figma with **File → Save local copy** and drop it over
`design/wireframes/ALLI_App_Wireframe.fig`.
