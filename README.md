# Aurora

A p5.js sketch that draws the northern lights as a fulldome film for the Wisdome in Malmö. The sketch is the piece. It can run as a preview in the browser, or save every frame so you can encode a 90-second film.

![A frame from the Aurora dome master](images/aurora-frame.jpg)

*A frame from the dome master. The circle is the whole 160° sky, the corners stay black.*

## What it is

Aurora is a slow, quiet piece for a tilted dome. A fragment shader builds the aurora from forty stacked layers of noise and draws it as an equidistant fisheye image, so the sky wraps around the audience.

The brightest curtains sit in the front of the dome, where people naturally look, and everything moves slowly to stay easy on the eyes.

It was made for the Wisdome 360 module of the Interaction Design master at Malmö University, 2026.

## What's in this repo

| File | What it is |
|---|---|
| `index.html` | Loads p5.js and Three.js and starts the sketch |
| `sketch.js` | The sketch: the shader, the export and the dome simulator |

The finished film is too big for the repository. Download it from the [Releases page](../../releases):

- `[film-name]_2048x2048_30fps.mp4`: the full dome master
- `[film-name]_reduced.mp4`: a lighter copy for quick viewing

## Run the preview

Open `index.html` in Chrome, Edge or Firefox, or copy the files into the p5.js web editor.

The preview is 1024 × 1024 and the aurora moves on its own.

| Key | What it does |
|---|---|
| `d` | Show or hide the guides: the edge of the circle, the diagonals and the sweet spot |
| `v` | Switch to the dome simulator, a view from inside the dome. Drag to look around, scroll to zoom |

## Make the film

The film is rendered frame by frame. Time comes from the frame number and the noise seed is fixed, so every render is identical.

1. In `sketch.js`, set `EXPORT = true`. Use `TOTAL_FRAMES = 150` for a 5-second test, or `2700` for the full 90 seconds.
2. Open the sketch. It saves `frame_0001.png`, `frame_0002.png` and so on at 2048 × 2048. Your browser may ask to allow many downloads.
3. Encode the frames with ffmpeg:

```bash
ffmpeg -framerate 30 -i frame_%04d.png -c:v libx264 -profile:v high \
       -pix_fmt yuv420p -b:v 60M -maxrate 60M -bufsize 120M -r 30 aurora.mp4
```

`LIVE_HDMI` is for playing live from a laptop at 3840 × 2160 with the master in the centre. Leave it `false` when exporting.

## Format

- Equidistant fisheye, 160° field of view
- 2048 × 2048, 30 fps, 90 seconds
- H.264 High profile, about 60 Mbit/s
- A white flash on the first frame as a sync marker

## Credits

- The aurora is adapted from the ["Aurora sky shader"](https://godotshaders.com/shader/aurora-sky-shader/) for Godot by [BluePhoenix1](https://godotshaders.com/author/bluephoenix1/) (4 July 2026, CC0). That shader is itself based on ["Auroras" by nimitz](https://www.shadertoy.com/view/XtGGRt) (2017). Licence: [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/).
- Made with [p5.js](https://p5js.org) and [Three.js](https://threejs.org) for the simulator.
- Dome geometry from the [Wisdome 360 course site](https://dcuartielles.github.io/wisdome-360/).

## Licence

This sketch and the film made from it are adapted from "Auroras" by nimitz, which is released under [Creative Commons Attribution-NonCommercial-ShareAlike 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). So this work is released under the same licence (CC BY-NC-SA 3.0).

You can share and adapt it with credit, for non-commercial use only, and any adaptation has to keep the same licence.

## Author

Barbara Melloni. [barbaramelloni.framer.website](https://barbaramelloni.framer.website)
