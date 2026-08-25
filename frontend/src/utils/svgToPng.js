/*
  PNG made here, from the SVG the server stores.

  The backend used to rasterize this with CairoSVG, which loads the native
  libcairo at runtime — a system library pip cannot supply. So PNG export
  worked or didn't depending on the host: fine in the Docker image, broken on
  a Mac without Homebrew's lib dir on the linker path, and a GTK-DLL hunt on
  Windows. Where it broke it broke silently, storing an SVG under a PNG name,
  and the download reported "no image available for this project" as if the
  plan were at fault.

  A saved diagram is self-contained (inline styles, hex colours, intrinsic
  width and height), so the browser can rasterize it with nothing installed.
  That removed the project's last native system dependency: the backend is now
  a plain `uv sync` on Linux, macOS and Windows alike.

  Known ceiling: the diagram's Archivo Narrow labels fall back to the
  platform's narrow sans, because an SVG loaded through an <img> cannot reach
  the page's webfonts. Inline the font as base64 in the SVG if that matters.
*/

// Wide enough that part labels survive being printed and read at the saw.
const RASTER_WIDTH = 2000;

export const svgBlobToPngBlob = (svgBlob) => new Promise((resolve, reject) => {
  const objectUrl = URL.createObjectURL(svgBlob);
  const image = new Image();

  image.onload = () => {
    const scale = RASTER_WIDTH / (image.naturalWidth || RASTER_WIDTH);
    const canvas = document.createElement('canvas');
    canvas.width = RASTER_WIDTH;
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

    const ctx = canvas.getContext('2d');
    // A PNG carries transparency where the SVG left the ground bare; a plan
    // that gets printed wants paper behind it, not a checkerboard.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(objectUrl);

    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('the browser could not encode the PNG'))),
      'image/png',
    );
  };

  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error('the diagram could not be read'));
  };

  image.src = objectUrl;
});
