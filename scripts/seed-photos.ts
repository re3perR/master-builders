import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { Database } from "../src/lib/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Нужны NEXT_PUBLIC_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local.");
  process.exit(1);
}

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const tones = ["#e7ebef", "#ebe8e3", "#e5eae6", "#e8e7ee"];

function seedId(key: string) {
  const hex = createHash("md5").update(`master-builders:${key}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function escape(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function picture(width: number, height: number, number: number, version: number, position: number, total: number) {
  const pad = Math.round(width * 0.075);
  const panelHeight = Math.round(height * 0.56);
  const columns = 3 + (position % 3);
  const rows = 2 + (version % 2);
  const cellWidth = (width - pad * 2) / columns;
  const cellHeight = panelHeight / rows;
  const cells: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const shade = (row + column + position) % 2 === 0 ? "#eef1f4" : "#e2e7ec";
      cells.push(
        `<rect x="${pad + column * cellWidth + 6}" y="${pad + row * cellHeight + 6}" width="${cellWidth - 12}" height="${cellHeight - 12}" rx="6" fill="${shade}" stroke="#b9c3cd" stroke-width="3"/>`,
      );
    }
  }
  const textTop = pad + panelHeight + Math.round(height * 0.12);
  const font = "Inter, 'DejaVu Sans', sans-serif";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${tones[number % tones.length]}"/>
  <rect x="${pad - 10}" y="${pad - 10}" width="${width - pad * 2 + 20}" height="${panelHeight + 20}" rx="12" fill="#f6f8fa" stroke="#aab4bf" stroke-width="4"/>
  ${cells.join("\n  ")}
  <line x1="${pad}" y1="${pad + panelHeight + 40}" x2="${width - pad}" y2="${pad + panelHeight + 40}" stroke="#8a96a3" stroke-width="3" stroke-dasharray="14 10"/>
  <text x="${pad}" y="${textTop}" font-family="${font}" font-size="${Math.round(height * 0.1)}" font-weight="700" fill="#17212b">MB-${number}</text>
  <text x="${pad}" y="${textTop + Math.round(height * 0.07)}" font-family="${font}" font-size="${Math.round(height * 0.042)}" fill="#3d4a59">${escape(`Отчёт, версия ${version} · фото ${position} из ${total}`)}</text>
  <text x="${pad}" y="${textTop + Math.round(height * 0.12)}" font-family="${font}" font-size="${Math.round(height * 0.03)}" fill="#526173">Демонстрационное изображение</text>
</svg>`;
}

async function main() {
  const { data: uploads, error } = await admin
    .from("uploads")
    .select("id, task_id, report_id, storage_path, mime_type, width, height, position")
    .not("report_id", "is", null);
  if (error) throw error;

  const reportIds = [...new Set(uploads.map((upload) => upload.report_id as string))];
  const taskIds = [...new Set(uploads.map((upload) => upload.task_id))];
  const [reports, tasks] = await Promise.all([
    admin.from("task_reports").select("id, version").in("id", reportIds),
    admin.from("tasks").select("id, number").in("id", taskIds),
  ]);
  if (reports.error) throw reports.error;
  if (tasks.error) throw tasks.error;

  const versionOf = new Map(reports.data.map((report) => [report.id, report.version]));
  const numberOf = new Map(tasks.data.map((task) => [task.id, task.number]));
  const totals = new Map<string, number>();
  for (const upload of uploads) {
    totals.set(upload.report_id as string, (totals.get(upload.report_id as string) ?? 0) + 1);
  }

  let written = 0;
  let skipped = 0;
  for (const upload of uploads) {
    const number = numberOf.get(upload.task_id);
    const version = versionOf.get(upload.report_id as string);
    const position = upload.position ?? 1;
    if (!number || !version || upload.id !== seedId(`upload:${number}:${version}:${position}`)) {
      skipped += 1;
      continue;
    }
    const width = upload.width ?? 1600;
    const height = upload.height ?? 1200;
    const svg = picture(width, height, number, version, position, totals.get(upload.report_id as string) ?? 1);
    const image = sharp(Buffer.from(svg));
    const body =
      upload.mime_type === "image/png"
        ? await image.png().toBuffer()
        : upload.mime_type === "image/webp"
          ? await image.webp({ quality: 82 }).toBuffer()
          : await image.jpeg({ quality: 82 }).toBuffer();

    const { error: uploadError } = await admin.storage
      .from("task-photos")
      .upload(upload.storage_path, body, { contentType: upload.mime_type, upsert: true });
    if (uploadError) throw uploadError;
    written += 1;
  }

  console.log(`Демонстрационные фото загружены: ${written}. Пропущено фото, не относящихся к seed: ${skipped}.`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
