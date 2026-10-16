import "server-only";
import sharp, { type Sharp } from "sharp";
import { maxPhotoBytes } from "./limits";

type Format = "jpeg" | "png" | "webp";

export type PhotoProblem = "heic" | "unsupported" | "damaged" | "too_small" | "too_big" | "too_large";

export class PhotoRejected extends Error {
  constructor(readonly problem: PhotoProblem) {
    super(problem);
  }
}

const maxSide = 2560;
const minSide = 100;
const maxPixels = 100_000_000;

const mimeTypes: Record<Format, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function ascii(bytes: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...bytes.subarray(from, to));
}

function detect(bytes: Uint8Array): Format | "heic" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") return "png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (ascii(bytes, 4, 8) === "ftyp" && /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(ascii(bytes, 8, 12))) {
    return "heic";
  }
  return null;
}

function encode(image: Sharp, format: Format) {
  if (format === "png") return image.png();
  if (format === "webp") return image.webp({ quality: 82 });
  return image.jpeg({ quality: 82 });
}

export async function processPhoto(input: Buffer) {
  const format = detect(input);
  if (format === "heic") throw new PhotoRejected("heic");
  if (!format) throw new PhotoRejected("unsupported");

  const options = { failOn: "error", limitInputPixels: maxPixels } as const;

  let width: number;
  let height: number;
  try {
    const meta = await sharp(input, options).metadata();
    if (meta.format !== format) throw new PhotoRejected("unsupported");
    width = meta.autoOrient.width;
    height = meta.autoOrient.height;
  } catch (error) {
    if (error instanceof PhotoRejected) throw error;
    throw new PhotoRejected("damaged");
  }

  if (width * height > maxPixels) throw new PhotoRejected("too_big");
  if (Math.min(width, height) < minSide) throw new PhotoRejected("too_small");

  let side = maxSide;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const image = sharp(input, { ...options, autoOrient: true })
      .resize({ width: side, height: side, fit: "inside", withoutEnlargement: true })
      .timeout({ seconds: 30 });
    const output = await encode(image, format)
      .toBuffer({ resolveWithObject: true })
      .catch(() => {
        throw new PhotoRejected("damaged");
      });
    if (output.data.length <= maxPhotoBytes) {
      return {
        data: output.data,
        mimeType: mimeTypes[format],
        width: output.info.width,
        height: output.info.height,
      };
    }
    side = Math.floor(Math.max(output.info.width, output.info.height) * 0.75);
  }
  throw new PhotoRejected("too_large");
}
