# Web Radio – NZ & the World

A dependency-free installable PWA for listening to live radio, defaulting to New Zealand.

- **Stations:** [Radio Browser](https://www.radio-browser.info/) community directory (free, no API key)
- **Features:** country picker (NZ default, worldwide), search, genre chips, favourites, "Surprise me",
  sleep timer with fade-out, lock-screen/headset controls (Media Session), HLS streams (hls.js loaded on demand),
  offline app shell + cached station lists
- **Only HTTPS streams are listed** – browsers block `http://` audio on an HTTPS page.

## Run
Service workers need HTTP(S) – serve the folder, e.g. `python3 -m http.server 8080`, then open `http://localhost:8080`.
Deploy anywhere static (GitHub Pages, Netlify, Cloudflare Pages) and use "Install app" / "Add to Home Screen".

## Files
`index.html` · `styles.css` · `app.js` · `sw.js` (offline) · `manifest.webmanifest` · `icons/`

## Notes
Live audio can't be cached, so playback needs a connection. Bump `VERSION` in `sw.js` when you change shell files.
